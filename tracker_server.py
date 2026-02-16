"""
Tracker Streaming Server
========================
Flask server that exposes the MediaPipe-based auscultation tracker
as an MJPEG video stream for the triage dashboard.

Endpoints:
    GET  /feed?mode=heart|lung   — MJPEG stream of annotated webcam frames
    GET  /status                 — JSON: which points are aligned, progress
    POST /reset                  — Reset visited points
    GET  /health                 — Returns {"available": true}

Run:  python tracker_server.py
Port: 5050

Dependencies:
    pip install flask opencv-python mediapipe numpy
"""

import cv2
import numpy as np
import math
import time
import os
import threading
import urllib.request

from flask import Flask, Response, request, jsonify

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

# ─── Configuration ────────────────────────────────────────────────────────────

PORT = 5050
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
POSE_MODEL = os.path.join(SCRIPT_DIR, "pose_landmarker.task")
HAND_MODEL = os.path.join(SCRIPT_DIR, "hand_landmarker.task")
POSE_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
HAND_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"

# Streaming resolution (lower = faster FPS)
STREAM_W = 640
STREAM_H = 480

# ─── Design Tokens ────────────────────────────────────────────────────────────

BG_PANEL      = (18, 15, 20)
WHITE         = (255, 255, 255)
DIM_WHITE     = (155, 155, 160)
SKELETON_COL  = (80, 70, 65)
HAND_COL      = (180, 140, 60)

# Heart theme
CARDIAC_RED   = (70, 60, 220)
CARDIAC_LIGHT = (100, 100, 255)
GOLD          = (50, 190, 255)
GREEN_OK      = (80, 230, 120)
GREEN_DIM     = (55, 160, 80)

# Lung theme
ACCENT_CYAN  = (230, 200, 50)
ACCENT_GREEN = (80, 240, 120)
ACCENT_RED   = (80, 80, 230)
ACCENT_AMBER = (60, 180, 255)
LUNG_DEFAULT = (100, 100, 220)
LUNG_ACTIVE  = (80, 255, 130)
LUNG_VISITED = (60, 180, 90)

ALIGNMENT_RADIUS = 48
POINT_R = 10

# ─── Shared State ─────────────────────────────────────────────────────────────

class TrackerState:
    """Thread-safe shared state between the processing loop and Flask routes."""
    def __init__(self):
        self.lock = threading.Lock()
        self.mode = "heart"
        self.visited = {}
        self.reset_requested = False
        self.running = True
        # Latest encoded JPEG frame (bytes) — written by processing thread,
        # read by any number of /feed clients
        self.jpeg_frame = None
        self.frame_event = threading.Event()   # signalled on every new frame

state = TrackerState()

# ─── Utilities ────────────────────────────────────────────────────────────────

def ensure_model(path, url):
    if not os.path.isfile(path):
        print(f"[INFO] Downloading {os.path.basename(path)} ...")
        urllib.request.urlretrieve(url, path)
        print("[INFO] Done.")


def px(lm, w, h):
    return int(lm.x * w), int(lm.y * h)


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def rounded_rect(img, pt1, pt2, colour, radius=12, thickness=-1, alpha=0.75):
    overlay = img.copy()
    x1, y1 = pt1
    x2, y2 = pt2
    cv2.rectangle(overlay, (x1 + radius, y1), (x2 - radius, y2), colour, thickness)
    cv2.rectangle(overlay, (x1, y1 + radius), (x2, y2 - radius), colour, thickness)
    cv2.ellipse(overlay, (x1 + radius, y1 + radius), (radius, radius), 180, 0, 90, colour, thickness)
    cv2.ellipse(overlay, (x2 - radius, y1 + radius), (radius, radius), 270, 0, 90, colour, thickness)
    cv2.ellipse(overlay, (x1 + radius, y2 - radius), (radius, radius),  90, 0, 90, colour, thickness)
    cv2.ellipse(overlay, (x2 - radius, y2 - radius), (radius, radius),   0, 0, 90, colour, thickness)
    cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0, img)


# ─── Anatomy ──────────────────────────────────────────────────────────────────

def get_body_anchors(plm, w, h):
    ls = px(plm[11], w, h)
    rs = px(plm[12], w, h)
    lh = px(plm[23], w, h)
    rh = px(plm[24], w, h)
    return ls, rs, lh, rh


def compute_cardiac_points(plm, w, h):
    ls, rs, lh, rh = get_body_anchors(plm, w, h)
    torso_h = int(((lh[1] - ls[1]) + (rh[1] - rs[1])) / 2)
    mid_x = (ls[0] + rs[0]) // 2
    top_y = (ls[1] + rs[1]) // 2
    shoulder_w = abs(rs[0] - ls[0])
    stb = int(shoulder_w * 0.11)
    mcl = int(shoulder_w * 0.32)

    ics2 = int(torso_h * 0.12)
    ics3 = int(torso_h * 0.21)
    ics4 = int(torso_h * 0.30)
    ics5 = int(torso_h * 0.39)

    points = [
        {"name": "Aortic",    "pos": (mid_x - stb, top_y + ics2), "order": 1},
        {"name": "Pulmonic",  "pos": (mid_x + stb, top_y + ics2), "order": 2},
        {"name": "Erb's Pt",  "pos": (mid_x + stb, top_y + ics3), "order": 3},
        {"name": "Tricuspid", "pos": (mid_x + stb, top_y + ics4), "order": 4},
        {"name": "Mitral",    "pos": (mid_x + mcl, top_y + ics5), "order": 5},
    ]
    return points, (ls, rs, lh, rh)


def compute_lung_points(plm, w, h):
    ls, rs, lh, rh = get_body_anchors(plm, w, h)
    torso_h = int(((lh[1] - ls[1]) + (rh[1] - rs[1])) / 2)
    mid_x = (ls[0] + rs[0]) // 2
    top_y = (ls[1] + rs[1]) // 2
    mcl = int(abs(rs[0] - ls[0]) * 0.32)

    points = [
        {"name": "R Apex",   "pos": (mid_x - mcl, top_y + int(torso_h * 0.03)), "order": 1},
        {"name": "L Apex",   "pos": (mid_x + mcl, top_y + int(torso_h * 0.03)), "order": 2},
        {"name": "R Upper",  "pos": (mid_x - mcl, top_y + int(torso_h * 0.14)), "order": 3},
        {"name": "L Upper",  "pos": (mid_x + mcl, top_y + int(torso_h * 0.14)), "order": 4},
        {"name": "R Middle", "pos": (mid_x - mcl, top_y + int(torso_h * 0.32)), "order": 5},
        {"name": "R Lower",  "pos": (mid_x - mcl, top_y + int(torso_h * 0.50)), "order": 6},
        {"name": "L Lower",  "pos": (mid_x + mcl, top_y + int(torso_h * 0.50)), "order": 7},
    ]
    return points, (ls, rs, lh, rh)


# ─── Drawing (optimized: no glow, simpler overlays) ─────────────────────────

def draw_skeleton(frame, plm, w, h):
    CONNS = [
        (11,12),(11,13),(13,15),(12,14),(14,16),
        (11,23),(12,24),(23,24),(23,25),(24,26),(25,27),(26,28),
    ]
    for a, b in CONNS:
        cv2.line(frame, px(plm[a], w, h), px(plm[b], w, h), SKELETON_COL, 1, cv2.LINE_AA)
    for i in [11,12,13,14,15,16,23,24,25,26,27,28]:
        cv2.circle(frame, px(plm[i], w, h), 3, SKELETON_COL, -1, cv2.LINE_AA)


def draw_hand(frame, hlm, w, h):
    CONNS = [
        (0,1),(1,2),(2,3),(3,4),(0,5),(5,6),(6,7),(7,8),
        (5,9),(9,10),(10,11),(11,12),(9,13),(13,14),(14,15),(15,16),
        (13,17),(17,18),(18,19),(19,20),(0,17),
    ]
    for a, b in CONNS:
        cv2.line(frame, px(hlm[a], w, h), px(hlm[b], w, h), HAND_COL, 1, cv2.LINE_AA)
    for i in range(21):
        cv2.circle(frame, px(hlm[i], w, h), 2, (230, 190, 70), -1, cv2.LINE_AA)


def draw_torso_zone(frame, anchors):
    ls, rs, lh, rh = anchors
    pts = np.array([rs, ls, lh, rh], dtype=np.int32)
    overlay = frame.copy()
    cv2.fillPoly(overlay, [pts], (35, 25, 30))
    cv2.addWeighted(overlay, 0.15, frame, 0.85, 0, frame)
    cv2.polylines(frame, [pts], True, (65, 55, 55), 1, cv2.LINE_AA)

    mid_x = (ls[0] + rs[0]) // 2
    top_y = min(ls[1], rs[1])
    bot_y = max(lh[1], rh[1])
    seg = 8
    for y in range(top_y, bot_y, seg * 2):
        cv2.line(frame, (mid_x, y), (mid_x, min(y + seg, bot_y)), (50, 40, 40), 1, cv2.LINE_AA)


def draw_target_point(frame, t, aligned, visited_flag, is_heart, t_now, order_active):
    pos = t["pos"]
    cx, cy = pos
    order = t.get("order", 0)

    if aligned:
        col = GREEN_OK if is_heart else LUNG_ACTIVE
        r = POINT_R + 3
        pulse = int(4 * abs(math.sin(t_now * 4)))
        cv2.circle(frame, pos, r + 4 + pulse, col, 2, cv2.LINE_AA)
    elif visited_flag:
        col = GREEN_DIM if is_heart else LUNG_VISITED
        r = POINT_R
    else:
        if is_heart:
            col = CARDIAC_RED if order == order_active else CARDIAC_LIGHT
        else:
            col = LUNG_DEFAULT
        r = POINT_R
        if order == order_active:
            breath = int(3 * abs(math.sin(t_now * 2)))
            check_col = CARDIAC_RED if is_heart else LUNG_DEFAULT
            cv2.circle(frame, pos, r + breath + 6, check_col, 1, cv2.LINE_AA)

    cv2.circle(frame, pos, r, col, -1, cv2.LINE_AA)
    cv2.circle(frame, pos, r + 1, WHITE, 1, cv2.LINE_AA)

    if is_heart:
        num_str = str(order)
        (tw, th), _ = cv2.getTextSize(num_str, cv2.FONT_HERSHEY_SIMPLEX, 0.35, 1)
        cv2.putText(frame, num_str, (cx - tw // 2, cy + th // 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.35, WHITE, 1, cv2.LINE_AA)

    cv2.line(frame, (cx - r - 4, cy), (cx - r, cy), DIM_WHITE, 1, cv2.LINE_AA)
    cv2.line(frame, (cx + r, cy), (cx + r + 4, cy), DIM_WHITE, 1, cv2.LINE_AA)
    cv2.line(frame, (cx, cy - r - 4), (cx, cy - r), DIM_WHITE, 1, cv2.LINE_AA)
    cv2.line(frame, (cx, cy + r), (cx, cy + r + 4), DIM_WHITE, 1, cv2.LINE_AA)

    label = t["name"]
    (lw, lh_), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.34, 1)
    lx = cx - lw // 2
    ly = cy - r - 12
    rounded_rect(frame, (lx - 4, ly - lh_ - 2), (lx + lw + 4, ly + 3), BG_PANEL, radius=4, alpha=0.70)
    cv2.putText(frame, label, (lx, ly), cv2.FONT_HERSHEY_SIMPLEX, 0.34, WHITE, 1, cv2.LINE_AA)


def draw_connection_lines(frame, targets):
    ordered = sorted(targets, key=lambda t: t["order"])
    for i in range(len(ordered) - 1):
        p1, p2 = ordered[i]["pos"], ordered[i + 1]["pos"]
        length = dist(p1, p2)
        if length < 1:
            continue
        seg = 6
        dx, dy = (p2[0] - p1[0]) / length, (p2[1] - p1[1]) / length
        d = 0
        while d < length:
            s = d
            e = min(d + seg, length)
            sp = (int(p1[0] + dx * s), int(p1[1] + dy * s))
            ep = (int(p1[0] + dx * e), int(p1[1] + dy * e))
            cv2.line(frame, sp, ep, (50, 40, 40), 1, cv2.LINE_AA)
            d += seg * 2


def draw_hud(frame, visited, targets, is_heart, fps, w, h, t_now):
    panel_w = 200
    panel_h = 55 + len(targets) * 26 + 40
    px1 = w - panel_w - 10
    py1 = 42
    px2 = w - 10
    py2 = py1 + panel_h
    rounded_rect(frame, (px1, py1), (px2, py2), BG_PANEL, radius=10, alpha=0.82)

    title = "CARDIAC EXAM" if is_heart else "LUNG FIELDS"
    title_col = CARDIAC_RED if is_heart else ACCENT_GREEN
    cv2.putText(frame, title, (px1 + 12, py1 + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.42, title_col, 1, cv2.LINE_AA)
    cv2.line(frame, (px1 + 10, py1 + 28), (px2 - 10, py1 + 28), (50, 40, 45), 1, cv2.LINE_AA)

    ordered = sorted(targets, key=lambda t: t["order"])
    y = py1 + 44
    done_count = sum(1 for t in ordered if visited.get(t["name"], False))

    for t in ordered:
        ok = visited.get(t["name"], False)
        badge_col = GREEN_OK if ok else (60, 50, 55)
        cv2.circle(frame, (px1 + 20, y - 3), 7, badge_col, -1, cv2.LINE_AA)
        cv2.circle(frame, (px1 + 20, y - 3), 7, (80, 70, 70), 1, cv2.LINE_AA)
        num = str(t["order"])
        (nw, nh), _ = cv2.getTextSize(num, cv2.FONT_HERSHEY_SIMPLEX, 0.28, 1)
        cv2.putText(frame, num, (px1 + 20 - nw // 2, y - 3 + nh // 2), cv2.FONT_HERSHEY_SIMPLEX, 0.28, WHITE, 1, cv2.LINE_AA)

        tcol = GREEN_OK if ok else DIM_WHITE
        cv2.putText(frame, t["name"], (px1 + 34, y), cv2.FONT_HERSHEY_SIMPLEX, 0.32, tcol, 1, cv2.LINE_AA)
        if ok:
            cv2.putText(frame, "OK", (px2 - 30, y), cv2.FONT_HERSHEY_SIMPLEX, 0.26, GREEN_OK, 1, cv2.LINE_AA)
        y += 26

    bar_y = y + 4
    bar_x1 = px1 + 10
    bar_x2 = px2 - 10
    bar_w = bar_x2 - bar_x1
    progress = done_count / max(len(targets), 1)
    fill_w = int(bar_w * progress)
    bar_col = CARDIAC_RED if is_heart else ACCENT_GREEN

    cv2.rectangle(frame, (bar_x1, bar_y), (bar_x2, bar_y + 7), (40, 35, 38), -1)
    if fill_w > 0:
        cv2.rectangle(frame, (bar_x1, bar_y), (bar_x1 + fill_w, bar_y + 7), bar_col, -1)
    cv2.rectangle(frame, (bar_x1, bar_y), (bar_x2, bar_y + 7), (60, 55, 58), 1)
    pct = f"{int(progress * 100)}%"
    cv2.putText(frame, pct, (bar_x2 + 4, bar_y + 7), cv2.FONT_HERSHEY_SIMPLEX, 0.24, DIM_WHITE, 1, cv2.LINE_AA)


def draw_top_bar(frame, w, fps, is_heart, mode_name):
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 32), BG_PANEL, -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

    title_col = GOLD if is_heart else ACCENT_CYAN
    title = "HEART PLACEMENT TRACKER" if is_heart else "LUNG PLACEMENT TRACKER"
    cv2.putText(frame, title, (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.42, title_col, 1, cv2.LINE_AA)
    cv2.putText(frame, f"FPS {int(fps)}", (w - 70, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.30, DIM_WHITE, 1, cv2.LINE_AA)


def draw_bottom_bar(frame, w, h, all_done, is_heart, t_now):
    bar_h = 32
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, h - bar_h), (w, h), BG_PANEL, -1)
    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

    if all_done:
        label = "ALL CARDIAC POINTS CHECKED" if is_heart else "ALL LUNG POINTS CHECKED"
        cv2.putText(frame, label, (w // 2 - 140, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.44, GREEN_OK, 1, cv2.LINE_AA)
    else:
        msg = "Place hand on each target point"
        cv2.putText(frame, msg, (w // 2 - 130, h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.38, DIM_WHITE, 1, cv2.LINE_AA)


# ─── Background Processing Thread ────────────────────────────────────────────
#
#  This runs ONCE when the server starts and keeps going forever.
#  It captures frames, processes them with MediaPipe, draws overlays,
#  encodes to JPEG, and stores the result in state.jpeg_frame.
#  The /feed endpoint just reads the latest JPEG — no per-request camera.
#

def processing_loop():
    """Persistent background loop — captures, processes, and encodes frames."""
    ensure_model(POSE_MODEL, POSE_URL)
    ensure_model(HAND_MODEL, HAND_URL)

    BaseOptions = mp_python.BaseOptions

    pose_opts = vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=POSE_MODEL),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    hand_opts = vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=HAND_MODEL),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=2,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[ERROR] Cannot open webcam.")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, STREAM_W)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, STREAM_H)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    prev_time = time.time()
    last_pose_res = None
    last_hand_res = None

    print("[INFO] Processing loop started — camera is live.")

    with vision.PoseLandmarker.create_from_options(pose_opts) as pose_lm, \
         vision.HandLandmarker.create_from_options(hand_opts) as hand_lm:

        frame_idx = 0

        while state.running:
            ret, frame = cap.read()
            if not ret:
                time.sleep(0.01)
                continue

            frame = cv2.flip(frame, 1)
            h, w, _ = frame.shape
            frame_idx += 1

            # Detect every 2nd frame for speed
            if frame_idx % 2 == 0:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                ts = int(frame_idx * (1000 / 30))
                last_pose_res = pose_lm.detect_for_video(mp_image, ts)
                last_hand_res = hand_lm.detect_for_video(mp_image, ts)

            pose_res = last_pose_res
            hand_res = last_hand_res
            t_now = time.time()

            if pose_res is None:
                # Still initializing
                cv2.putText(frame, "Initializing...", (w // 2 - 70, h // 2),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, DIM_WHITE, 1, cv2.LINE_AA)
                _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
                with state.lock:
                    state.jpeg_frame = buf.tobytes()
                state.frame_event.set()
                state.frame_event.clear()
                continue

            with state.lock:
                current_mode = state.mode
                if state.reset_requested:
                    state.visited = {}
                    state.reset_requested = False
                visited = dict(state.visited)

            is_heart = current_mode == "heart"

            if pose_res.pose_landmarks and len(pose_res.pose_landmarks) > 0:
                plm = pose_res.pose_landmarks[0]
                draw_skeleton(frame, plm, w, h)

                if is_heart:
                    targets, anchors = compute_cardiac_points(plm, w, h)
                else:
                    targets, anchors = compute_lung_points(plm, w, h)

                draw_torso_zone(frame, anchors)

                current_names = {t["name"] for t in targets}
                visited = {k: v for k, v in visited.items() if k in current_names}
                for t in targets:
                    if t["name"] not in visited:
                        visited[t["name"]] = False

                order_active = 0
                for t in sorted(targets, key=lambda x: x["order"]):
                    if not visited.get(t["name"], False):
                        order_active = t["order"]
                        break

                if is_heart:
                    draw_connection_lines(frame, targets)

                hand_positions = []
                if hand_res and hand_res.hand_landmarks:
                    for hlm in hand_res.hand_landmarks:
                        draw_hand(frame, hlm, w, h)
                        hc = px(hlm[9], w, h)
                        hand_positions.append(hc)

                for t in targets:
                    aligned = False
                    for hp in hand_positions:
                        if dist(hp, t["pos"]) < ALIGNMENT_RADIUS:
                            aligned = True
                            visited[t["name"]] = True
                            break

                    draw_target_point(frame, t, aligned, visited.get(t["name"], False),
                                      is_heart, t_now, order_active)

                    if aligned:
                        for hp in hand_positions:
                            if dist(hp, t["pos"]) < ALIGNMENT_RADIUS:
                                line_col = GREEN_OK if is_heart else LUNG_ACTIVE
                                cv2.line(frame, hp, t["pos"], line_col, 2, cv2.LINE_AA)
                                break

                with state.lock:
                    state.visited = dict(visited)

                curr_time = time.time()
                fps = 1.0 / (curr_time - prev_time + 1e-9)
                prev_time = curr_time

                draw_hud(frame, visited, targets, is_heart, fps, w, h, t_now)
                draw_top_bar(frame, w, fps, is_heart, current_mode)

                all_done = all(visited.values()) if visited else False
                draw_bottom_bar(frame, w, h, all_done, is_heart, t_now)

            else:
                curr_time = time.time()
                fps = 1.0 / (curr_time - prev_time + 1e-9)
                prev_time = curr_time

                cv2.putText(frame, "Step into frame", (w // 2 - 80, h // 2 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, CARDIAC_RED, 2, cv2.LINE_AA)
                cv2.putText(frame, "Ensure upper body is visible",
                            (w // 2 - 120, h // 2 + 20),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.42, DIM_WHITE, 1, cv2.LINE_AA)
                draw_top_bar(frame, w, fps, is_heart, current_mode)

            # Encode and store in shared buffer
            _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
            with state.lock:
                state.jpeg_frame = buf.tobytes()
            state.frame_event.set()
            state.frame_event.clear()

    cap.release()
    print("[INFO] Processing loop stopped — camera released.")


# ─── Feed Generator (reads from shared buffer) ───────────────────────────────

def stream_feed():
    """Yields MJPEG frames from the shared buffer. Multiple clients can connect
       and disconnect without affecting the camera or processing loop."""
    while True:
        # Wait for a new frame (up to 1 second, then check again)
        state.frame_event.wait(timeout=1.0)
        with state.lock:
            jpeg = state.jpeg_frame
        if jpeg is None:
            continue
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + jpeg + b'\r\n')


# ─── Flask App ────────────────────────────────────────────────────────────────

app = Flask(__name__)

@app.route('/health')
def health():
    return jsonify({"available": True, "ok": True})


@app.route('/feed')
def feed():
    """MJPEG video stream. ?mode=heart|lung sets tracking mode."""
    mode = request.args.get('mode', 'heart').lower()
    if mode not in ('heart', 'lung'):
        mode = 'heart'
    with state.lock:
        if state.mode != mode:
            state.mode = mode
            state.visited = {}

    return Response(
        stream_feed(),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )


@app.route('/status')
def tracker_status():
    with state.lock:
        visited = dict(state.visited)
        mode = state.mode

    total = len(visited) if visited else 0
    done = sum(1 for v in visited.values() if v)
    progress = (done / total * 100) if total > 0 else 0

    return jsonify({
        "mode": mode,
        "visited": visited,
        "total": total,
        "done": done,
        "progress": round(progress, 1),
        "allDone": total > 0 and done == total,
    })


@app.route('/reset', methods=['POST'])
def reset_tracker():
    with state.lock:
        state.reset_requested = True
    return jsonify({"status": "reset"})


if __name__ == '__main__':
    # Start the background processing thread BEFORE Flask
    proc_thread = threading.Thread(target=processing_loop, daemon=True)
    proc_thread.start()

    print(f"\n  Tracker Server starting on http://localhost:{PORT}")
    print(f"  MJPEG feed:  http://localhost:{PORT}/feed?mode=heart")
    print(f"  Status:      http://localhost:{PORT}/status")
    print(f"  Reset:       POST http://localhost:{PORT}/reset\n")
    app.run(host='0.0.0.0', port=PORT, threaded=True, debug=False)
