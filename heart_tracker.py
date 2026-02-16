"""
Heart Auscultation Placement Tracker
=====================================
Dedicated cardiac stethoscope placement guide using MediaPipe + OpenCV.
Tracks hand position over the 5 standard cardiac auscultation points:

    1. Aortic       – 2nd right intercostal space, right sternal border
    2. Pulmonic     – 2nd left intercostal space, left sternal border
    3. Erb's Point  – 3rd left intercostal space, left sternal border
    4. Tricuspid    – 4th left intercostal space, left sternal border
    5. Mitral       – 5th left intercostal space, midclavicular line

Usage:  python heart_tracker.py
Controls:  Q = quit   R = reset

Dependencies:
    pip install opencv-python mediapipe numpy
"""

import cv2
import numpy as np
import math
import time
import os
import urllib.request

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

# ─── Model Paths ──────────────────────────────────────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
POSE_MODEL = os.path.join(SCRIPT_DIR, "pose_landmarker.task")
HAND_MODEL = os.path.join(SCRIPT_DIR, "hand_landmarker.task")
POSE_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
HAND_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"

# ─── Design Tokens ────────────────────────────────────────────────────────────

# Cardiac-red palette
BG_PANEL      = (18, 15, 20)
CARDIAC_RED   = (70, 60, 220)      # warm red  (BGR)
CARDIAC_LIGHT = (100, 100, 255)    # lighter red
ACCENT_CORAL  = (90, 120, 240)     # coral
GOLD          = (50, 190, 255)     # amber/gold
GREEN_OK      = (80, 230, 120)
GREEN_DIM     = (55, 160, 80)
WHITE         = (255, 255, 255)
DIM_WHITE     = (155, 155, 160)
SKELETON_COL  = (80, 70, 65)
HAND_COL      = (180, 140, 60)

ALIGNMENT_RADIUS = 48
POINT_R = 11

# Label descriptions (matching HeartExam.jsx)
POINT_DESCRIPTIONS = {
    "Aortic":    "2nd right intercostal",
    "Pulmonic":  "2nd left intercostal",
    "Erb's Pt":  "3rd left intercostal",
    "Tricuspid": "4th left intercostal",
    "Mitral":    "5th ICS, midclavicular",
}

# ─── Utilities ────────────────────────────────────────────────────────────────

def ensure_model(path, url):
    if not os.path.isfile(path):
        print(f"[INFO] Downloading {os.path.basename(path)} …")
        urllib.request.urlretrieve(url, path)
        print("[INFO] Done.")


def px(lm, w, h):
    return int(lm.x * w), int(lm.y * h)


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def glow(img, centre, radius, colour, layers=10, intensity=0.35):
    """Soft radial glow."""
    overlay = img.copy()
    for i in range(layers, 0, -1):
        r = radius + i * 2
        a = intensity * (i / layers) * 0.5
        cv2.circle(overlay, centre, r, colour, 2, cv2.LINE_AA)
        cv2.addWeighted(overlay, a, img, 1 - a, 0, img)
        overlay = img.copy()


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

def compute_cardiac_points(plm, w, h):
    """
    5 standard cardiac auscultation sites derived from pose landmarks.
    The camera view is MIRRORED, so anatomical-left appears on screen-right
    and anatomical-right appears on screen-left.

    Landmark 11 = Left Shoulder, 12 = Right Shoulder (MediaPipe convention,
    where Left/Right refer to the person's own body.)

    In a mirrored view:
      person's Right side  → screen Left   → near landmark 12 (R_SHOULDER)
      person's Left side   → screen Right  → near landmark 11 (L_SHOULDER)

    Auscultation points from the person's perspective:
      Aortic    = person's RIGHT sternal border  → screen LEFT  → offset towards R_SHOULDER
      Pulmonic  = person's LEFT sternal border   → screen RIGHT → offset towards L_SHOULDER
      Erb's     = person's LEFT sternal border   → screen RIGHT
      Tricuspid = person's LEFT sternal border   → screen RIGHT
      Mitral    = person's LEFT midclavicular    → screen RIGHT
    """
    ls = px(plm[11], w, h)   # L_SHOULDER (screen-right in mirror)
    rs = px(plm[12], w, h)   # R_SHOULDER (screen-left in mirror)
    lh = px(plm[23], w, h)
    rh = px(plm[24], w, h)

    torso_h = int(((lh[1] - ls[1]) + (rh[1] - rs[1])) / 2)
    mid_x   = (ls[0] + rs[0]) // 2
    top_y   = (ls[1] + rs[1]) // 2
    shoulder_w = abs(rs[0] - ls[0])

    # Sternal border ≈ 10-12% of shoulder width from midline
    stb = int(shoulder_w * 0.11)
    # Midclavicular line ≈ 32% of shoulder width from midline
    mcl = int(shoulder_w * 0.32)

    # Intercostal space vertical offsets (fraction of torso_h from shoulder line)
    ics2 = int(torso_h * 0.12)   # 2nd ICS
    ics3 = int(torso_h * 0.21)   # 3rd ICS
    ics4 = int(torso_h * 0.30)   # 4th ICS
    ics5 = int(torso_h * 0.39)   # 5th ICS

    # Screen-left = towards rs (person's right), screen-right = towards ls (person's left)
    # In the mirrored view: rs[0] < mid_x < ls[0] typically
    # Person's right sternal border → mid_x minus stb (towards screen-left / rs)
    # Person's left sternal border  → mid_x plus stb  (towards screen-right / ls)

    points = [
        # ── Aortic: 2nd ICS, person's RIGHT sternal border ──
        {"name": "Aortic",    "pos": (mid_x - stb, top_y + ics2),
         "desc": POINT_DESCRIPTIONS["Aortic"],    "order": 1},

        # ── Pulmonic: 2nd ICS, person's LEFT sternal border ──
        {"name": "Pulmonic",  "pos": (mid_x + stb, top_y + ics2),
         "desc": POINT_DESCRIPTIONS["Pulmonic"],  "order": 2},

        # ── Erb's Point: 3rd ICS, person's LEFT sternal border ──
        {"name": "Erb's Pt",  "pos": (mid_x + stb, top_y + ics3),
         "desc": POINT_DESCRIPTIONS["Erb's Pt"],  "order": 3},

        # ── Tricuspid: 4th ICS, person's LEFT sternal border ──
        {"name": "Tricuspid", "pos": (mid_x + stb, top_y + ics4),
         "desc": POINT_DESCRIPTIONS["Tricuspid"], "order": 4},

        # ── Mitral (Apex): 5th ICS, person's LEFT midclavicular line ──
        {"name": "Mitral",    "pos": (mid_x + mcl, top_y + ics5),
         "desc": POINT_DESCRIPTIONS["Mitral"],    "order": 5},
    ]

    return points, (ls, rs, lh, rh)


# ─── Drawing ─────────────────────────────────────────────────────────────────

def draw_heart_zone(frame, anchors, plm, w, h):
    """Draw a subtle heart-shaped zone on the upper-left chest area."""
    ls, rs, lh, rh = anchors

    # Torso overlay
    pts = np.array([rs, ls, lh, rh], dtype=np.int32)
    overlay = frame.copy()
    cv2.fillPoly(overlay, [pts], (35, 25, 30))
    cv2.addWeighted(overlay, 0.15, frame, 0.85, 0, frame)
    cv2.polylines(frame, [pts], True, (65, 55, 55), 1, cv2.LINE_AA)

    # Vertical sternum line
    mid_x = (ls[0] + rs[0]) // 2
    top_y = min(ls[1], rs[1])
    bot_y = max(lh[1], rh[1])
    # Dashed sternum
    seg = 8
    for y in range(top_y, bot_y, seg * 2):
        cv2.line(frame, (mid_x, y), (mid_x, min(y + seg, bot_y)),
                 (50, 40, 40), 1, cv2.LINE_AA)


def draw_skeleton(frame, plm, w, h):
    CONNS = [
        (11,12),(11,13),(13,15),(12,14),(14,16),
        (11,23),(12,24),(23,24),(23,25),(24,26),(25,27),(26,28),
    ]
    for a, b in CONNS:
        cv2.line(frame, px(plm[a], w, h), px(plm[b], w, h),
                 SKELETON_COL, 1, cv2.LINE_AA)
    for i in [11,12,13,14,15,16,23,24,25,26,27,28]:
        cv2.circle(frame, px(plm[i], w, h), 3, SKELETON_COL, -1, cv2.LINE_AA)


def draw_hand(frame, hlm, w, h):
    CONNS = [
        (0,1),(1,2),(2,3),(3,4),(0,5),(5,6),(6,7),(7,8),
        (5,9),(9,10),(10,11),(11,12),(9,13),(13,14),(14,15),(15,16),
        (13,17),(17,18),(18,19),(19,20),(0,17),
    ]
    for a, b in CONNS:
        cv2.line(frame, px(hlm[a], w, h), px(hlm[b], w, h),
                 HAND_COL, 1, cv2.LINE_AA)
    for i in range(21):
        cv2.circle(frame, px(hlm[i], w, h), 2, (230, 190, 70), -1, cv2.LINE_AA)


def draw_cardiac_target(frame, t, aligned, visited, t_now, order_active):
    """Draw a single cardiac point with order number, ring, and label."""
    pos = t["pos"]
    order = t["order"]
    cx, cy = pos

    if aligned:
        col = GREEN_OK
        r = POINT_R + 4
        glow(frame, pos, r, GREEN_OK, layers=8, intensity=0.4)
        # Pulsing ring
        pulse = int(5 * abs(math.sin(t_now * 4)))
        cv2.circle(frame, pos, r + 6 + pulse, GREEN_OK, 2, cv2.LINE_AA)
    elif visited:
        col = GREEN_DIM
        r = POINT_R
    else:
        col = CARDIAC_RED if order == order_active else CARDIAC_LIGHT
        r = POINT_R
        # Subtle breathing for active target
        if order == order_active:
            breath = int(3 * abs(math.sin(t_now * 2)))
            cv2.circle(frame, pos, r + breath + 6, CARDIAC_RED, 1, cv2.LINE_AA)

    # Filled circle
    cv2.circle(frame, pos, r, col, -1, cv2.LINE_AA)
    cv2.circle(frame, pos, r + 1, WHITE, 1, cv2.LINE_AA)

    # Order number in the circle
    num_str = str(order)
    (tw, th), _ = cv2.getTextSize(num_str, cv2.FONT_HERSHEY_SIMPLEX, 0.38, 1)
    cv2.putText(frame, num_str, (cx - tw // 2, cy + th // 2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.38, WHITE, 1, cv2.LINE_AA)

    # Crosshair ticks
    cv2.line(frame, (cx - r - 5, cy), (cx - r - 1, cy), DIM_WHITE, 1, cv2.LINE_AA)
    cv2.line(frame, (cx + r + 1, cy), (cx + r + 5, cy), DIM_WHITE, 1, cv2.LINE_AA)
    cv2.line(frame, (cx, cy - r - 5), (cx, cy - r - 1), DIM_WHITE, 1, cv2.LINE_AA)
    cv2.line(frame, (cx, cy + r + 1), (cx, cy + r + 5), DIM_WHITE, 1, cv2.LINE_AA)

    # Label pill above
    label = t["name"]
    (lw, lh_), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.36, 1)
    lx = cx - lw // 2
    ly = cy - r - 14
    rounded_rect(frame, (lx - 5, ly - lh_ - 2), (lx + lw + 5, ly + 3),
                 BG_PANEL, radius=5, alpha=0.72)
    cv2.putText(frame, label, (lx, ly),
                cv2.FONT_HERSHEY_SIMPLEX, 0.36, WHITE, 1, cv2.LINE_AA)

    # Description below (only for active/aligned)
    if order == order_active or aligned:
        desc = t["desc"]
        (dw, dh), _ = cv2.getTextSize(desc, cv2.FONT_HERSHEY_SIMPLEX, 0.28, 1)
        dx = cx - dw // 2
        dy = cy + r + 16
        cv2.putText(frame, desc, (dx, dy),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.28, DIM_WHITE, 1, cv2.LINE_AA)


def draw_connection_lines(frame, targets, visited_dict):
    """Draw faint lines connecting the 5 points in order (stethoscope path)."""
    ordered = sorted(targets, key=lambda t: t["order"])
    for i in range(len(ordered) - 1):
        p1 = ordered[i]["pos"]
        p2 = ordered[i + 1]["pos"]
        # Dashed line
        length = dist(p1, p2)
        if length < 1:
            continue
        seg_len = 6
        dx = (p2[0] - p1[0]) / length
        dy = (p2[1] - p1[1]) / length
        d = 0
        while d < length:
            s = d
            e = min(d + seg_len, length)
            sp = (int(p1[0] + dx * s), int(p1[1] + dy * s))
            ep = (int(p1[0] + dx * e), int(p1[1] + dy * e))
            cv2.line(frame, sp, ep, (50, 40, 40), 1, cv2.LINE_AA)
            d += seg_len * 2


def draw_hud(frame, visited, targets, fps, w, h, t_now):
    """Right-side vertical HUD panel for cardiac exam."""
    panel_w = 230
    panel_h = 60 + len(targets) * 36 + 60
    px1 = w - panel_w - 14
    py1 = 50
    px2 = w - 14
    py2 = py1 + panel_h

    rounded_rect(frame, (px1, py1), (px2, py2), BG_PANEL, radius=14, alpha=0.82)

    # Title
    cv2.putText(frame, "CARDIAC EXAM", (px1 + 16, py1 + 26),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, CARDIAC_RED, 1, cv2.LINE_AA)

    # Separator
    cv2.line(frame, (px1 + 14, py1 + 34), (px2 - 14, py1 + 34),
             (50, 40, 45), 1, cv2.LINE_AA)

    # Points list
    ordered = sorted(targets, key=lambda t: t["order"])
    y = py1 + 56
    done_count = 0
    for t in ordered:
        ok = visited.get(t["name"], False)
        if ok:
            done_count += 1

        # Number badge
        badge_col = GREEN_OK if ok else (60, 50, 55)
        cv2.circle(frame, (px1 + 26, y - 3), 10, badge_col, -1, cv2.LINE_AA)
        cv2.circle(frame, (px1 + 26, y - 3), 10, (80, 70, 70), 1, cv2.LINE_AA)
        num = str(t["order"])
        (nw, nh), _ = cv2.getTextSize(num, cv2.FONT_HERSHEY_SIMPLEX, 0.34, 1)
        cv2.putText(frame, num, (px1 + 26 - nw // 2, y - 3 + nh // 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.34, WHITE, 1, cv2.LINE_AA)

        # Label
        tcol = GREEN_OK if ok else DIM_WHITE
        cv2.putText(frame, t["name"], (px1 + 42, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, tcol, 1, cv2.LINE_AA)

        # Tick or empty
        if ok:
            cv2.putText(frame, "OK", (px2 - 36, y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.32, GREEN_OK, 1, cv2.LINE_AA)

        y += 36

    # Progress bar
    bar_y = y + 6
    bar_x1 = px1 + 14
    bar_x2 = px2 - 14
    bar_w = bar_x2 - bar_x1
    progress = done_count / max(len(targets), 1)
    fill_w = int(bar_w * progress)

    cv2.rectangle(frame, (bar_x1, bar_y), (bar_x2, bar_y + 8), (40, 35, 38), -1)
    if fill_w > 0:
        cv2.rectangle(frame, (bar_x1, bar_y), (bar_x1 + fill_w, bar_y + 8),
                      CARDIAC_RED, -1)
    cv2.rectangle(frame, (bar_x1, bar_y), (bar_x2, bar_y + 8), (60, 55, 58), 1)

    # Percentage
    pct = f"{int(progress * 100)}%"
    cv2.putText(frame, pct, (bar_x2 + 6, bar_y + 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.3, DIM_WHITE, 1, cv2.LINE_AA)


def draw_top_bar(frame, w, fps):
    """Top status bar – cardiac themed."""
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 38), BG_PANEL, -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

    # Heartbeat icon (ASCII-safe — OpenCV Hershey fonts don't support Unicode)
    cv2.putText(frame, "<3", (14, 27),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, CARDIAC_RED, 2, cv2.LINE_AA)
    cv2.putText(frame, "HEART PLACEMENT TRACKER", (46, 26),
                cv2.FONT_HERSHEY_SIMPLEX, 0.48, GOLD, 1, cv2.LINE_AA)

    # Controls
    cv2.putText(frame, "Q:Quit  R:Reset", (w - 140, 26),
                cv2.FONT_HERSHEY_SIMPLEX, 0.34, (100, 100, 105), 1, cv2.LINE_AA)

    # FPS
    cv2.putText(frame, f"FPS {int(fps)}", (w - 240, 26),
                cv2.FONT_HERSHEY_SIMPLEX, 0.34, DIM_WHITE, 1, cv2.LINE_AA)


def draw_bottom_bar(frame, w, h, all_done, t_now):
    """Bottom status bar."""
    bar_h = 42
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, h - bar_h), (w, h), BG_PANEL, -1)
    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

    if all_done:
        # Celebration
        pulse = 0.55 + 0.03 * math.sin(t_now * 3)
        cv2.putText(frame, "ALL 5 CARDIAC POINTS CHECKED", (w // 2 - 200, h - 14),
                    cv2.FONT_HERSHEY_SIMPLEX, pulse, GREEN_OK, 2, cv2.LINE_AA)
    else:
        cv2.putText(frame, "Place stethoscope/hand on each numbered cardiac point",
                    (w // 2 - 230, h - 16),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.44, DIM_WHITE, 1, cv2.LINE_AA)


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
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

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    visited = {}
    prev_time = time.time()

    with vision.PoseLandmarker.create_from_options(pose_opts) as pose_lm, \
         vision.HandLandmarker.create_from_options(hand_opts) as hand_lm:

        frame_idx = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            frame = cv2.flip(frame, 1)
            h, w, _ = frame.shape
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            frame_idx += 1
            ts = int(frame_idx * (1000 / 30))

            pose_res = pose_lm.detect_for_video(mp_image, ts)
            hand_res = hand_lm.detect_for_video(mp_image, ts)

            t_now = time.time()

            if pose_res.pose_landmarks and len(pose_res.pose_landmarks) > 0:
                plm = pose_res.pose_landmarks[0]

                draw_skeleton(frame, plm, w, h)

                targets, anchors = compute_cardiac_points(plm, w, h)
                draw_heart_zone(frame, anchors, plm, w, h)

                # Ensure visited dict
                for t in targets:
                    if t["name"] not in visited:
                        visited[t["name"]] = False

                # Determine next active target (first unvisited in order)
                order_active = 0
                for t in sorted(targets, key=lambda x: x["order"]):
                    if not visited.get(t["name"], False):
                        order_active = t["order"]
                        break

                # Draw connecting path
                draw_connection_lines(frame, targets, visited)

                # Hand positions
                hand_positions = []
                if hand_res.hand_landmarks:
                    for hlm in hand_res.hand_landmarks:
                        draw_hand(frame, hlm, w, h)
                        hc = px(hlm[9], w, h)
                        hand_positions.append(hc)

                # Check alignment & draw each target
                for t in targets:
                    aligned = False
                    for hp in hand_positions:
                        if dist(hp, t["pos"]) < ALIGNMENT_RADIUS:
                            aligned = True
                            visited[t["name"]] = True
                            break

                    draw_cardiac_target(frame, t, aligned,
                                        visited.get(t["name"], False),
                                        t_now, order_active)

                    if aligned:
                        for hp in hand_positions:
                            if dist(hp, t["pos"]) < ALIGNMENT_RADIUS:
                                cv2.line(frame, hp, t["pos"],
                                         GREEN_OK, 2, cv2.LINE_AA)
                                break

                # HUD
                curr_time = time.time()
                fps = 1.0 / (curr_time - prev_time + 1e-9)
                prev_time = curr_time

                draw_hud(frame, visited, targets, fps, w, h, t_now)
                draw_top_bar(frame, w, fps)

                all_done = all(visited.values()) if visited else False
                draw_bottom_bar(frame, w, h, all_done, t_now)

            else:
                # No body
                curr_time = time.time()
                fps = 1.0 / (curr_time - prev_time + 1e-9)
                prev_time = curr_time

                cv2.putText(frame, "Step into frame", (w // 2 - 100, h // 2 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, CARDIAC_RED, 2, cv2.LINE_AA)
                cv2.putText(frame, "Ensure upper body is visible",
                            (w // 2 - 145, h // 2 + 25),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.48, DIM_WHITE, 1, cv2.LINE_AA)
                draw_top_bar(frame, w, fps)

            cv2.imshow("Heart Placement Tracker", frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            elif key == ord('r'):
                visited = {k: False for k in visited}

    cap.release()
    cv2.destroyAllWindows()
    print("[INFO] Heart tracker closed.")


if __name__ == "__main__":
    main()
