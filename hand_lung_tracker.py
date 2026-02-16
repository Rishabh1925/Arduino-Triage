"""
Hand & Lung/Chest Alignment Tracker  –  v2.0 (Enhanced)
========================================================
Uses MediaPipe Tasks API (Pose Landmarker + Hand Landmarker) with OpenCV
to track hand placement over anatomically precise auscultation sites.

Auscultation sites (anterior):
  Lung fields:
    • R/L Apex          – infraclavicular, midclavicular line
    • R/L Upper Lobe    – 2nd intercostal space
    • R Mid Lobe        – 4th intercostal, right MCL
    • R/L Lower Lobe    – 6th intercostal space
  Cardiac:
    • Aortic            – 2nd ICS, right sternal border
    • Pulmonic          – 2nd ICS, left sternal border
    • Erb's Point       – 3rd ICS, left sternal border
    • Tricuspid         – 4th ICS, left sternal border
    • Mitral            – 5th ICS, left MCL

Controls:  q = quit   r = reset   m = toggle mode (lung / cardiac)

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

# ─── Paths ────────────────────────────────────────────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
POSE_MODEL  = os.path.join(SCRIPT_DIR, "pose_landmarker.task")
HAND_MODEL  = os.path.join(SCRIPT_DIR, "hand_landmarker.task")
POSE_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
HAND_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"

# ─── Design Tokens ────────────────────────────────────────────────────────────

# Palette – dark medical-monitor aesthetic
BG_PANEL     = (20, 20, 25)
ACCENT_CYAN  = (230, 200, 50)    # BGR  → warm cyan
ACCENT_GREEN = (80, 240, 120)
ACCENT_RED   = (80, 80, 230)
ACCENT_AMBER = (60, 180, 255)
WHITE        = (255, 255, 255)
DIM_WHITE    = (160, 160, 160)
SKELETON_COL = (100, 90, 80)
HAND_SKEL    = (200, 170, 50)

# Lung targets
LUNG_DEFAULT = (100, 100, 220)   # warm red-ish
LUNG_ACTIVE  = (80, 255, 130)    # green
LUNG_VISITED = (60, 180, 90)     # dim green

# Cardiac targets
CARD_DEFAULT = (180, 100, 100)   # blue-ish
CARD_ACTIVE  = (130, 220, 255)   # amber glow
CARD_VISITED = (90, 160, 180)

ALIGNMENT_RADIUS = 50
POINT_R          = 10

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


def lerp(a, b, t):
    return int(a + (b - a) * t)


def lerp_pt(p1, p2, t):
    return (lerp(p1[0], p2[0], t), lerp(p1[1], p2[1], t))


def midpoint(p1, p2):
    return ((p1[0] + p2[0]) // 2, (p1[1] + p2[1]) // 2)


def glow_circle(img, centre, radius, colour, intensity=0.45):
    """Soft glow effect around a circle."""
    overlay = img.copy()
    for r in range(radius + 18, radius, -2):
        alpha = intensity * ((radius + 18 - r) / 18)
        cv2.circle(overlay, centre, r, colour, 2, cv2.LINE_AA)
        cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0, img)
        overlay = img.copy()


def rounded_rect(img, pt1, pt2, colour, radius=12, thickness=-1, alpha=0.75):
    """Draw a rounded rectangle with transparency."""
    overlay = img.copy()
    x1, y1 = pt1
    x2, y2 = pt2
    # Main body
    cv2.rectangle(overlay, (x1 + radius, y1), (x2 - radius, y2), colour, thickness)
    cv2.rectangle(overlay, (x1, y1 + radius), (x2, y2 - radius), colour, thickness)
    # Corners
    cv2.ellipse(overlay, (x1 + radius, y1 + radius), (radius, radius), 180, 0, 90, colour, thickness)
    cv2.ellipse(overlay, (x2 - radius, y1 + radius), (radius, radius), 270, 0, 90, colour, thickness)
    cv2.ellipse(overlay, (x1 + radius, y2 - radius), (radius, radius),  90, 0, 90, colour, thickness)
    cv2.ellipse(overlay, (x2 - radius, y2 - radius), (radius, radius),   0, 0, 90, colour, thickness)
    cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0, img)


# ─── Anatomical Point Computation ────────────────────────────────────────────

def get_body_anchors(plm, w, h):
    """Return pixel coords for key body anchors."""
    ls = px(plm[11], w, h)   # left shoulder
    rs = px(plm[12], w, h)   # right shoulder
    lh = px(plm[23], w, h)   # left hip
    rh = px(plm[24], w, h)   # right hip
    return ls, rs, lh, rh


def compute_lung_points(plm, w, h):
    """Anatomically precise anterior lung auscultation sites."""
    ls, rs, lh, rh = get_body_anchors(plm, w, h)

    torso_h = int(((lh[1] - ls[1]) + (rh[1] - rs[1])) / 2)
    mid_x   = (ls[0] + rs[0]) // 2
    top_y   = (ls[1] + rs[1]) // 2

    # Midclavicular line offset (~35% of half-shoulder-width from midline)
    mcl = int(abs(rs[0] - ls[0]) * 0.32)
    # Sternal border offset (~12%)
    stb = int(abs(rs[0] - ls[0]) * 0.12)

    return [
        # Apices – just below clavicle
        {"name": "R Apex",       "pos": (mid_x - mcl, top_y + int(torso_h * 0.03)), "side": "R"},
        {"name": "L Apex",       "pos": (mid_x + mcl, top_y + int(torso_h * 0.03)), "side": "L"},
        # Upper lobes – 2nd intercostal space
        {"name": "R Upper",      "pos": (mid_x - mcl, top_y + int(torso_h * 0.14)), "side": "R"},
        {"name": "L Upper",      "pos": (mid_x + mcl, top_y + int(torso_h * 0.14)), "side": "L"},
        # Right middle lobe – 4th intercostal
        {"name": "R Middle",     "pos": (mid_x - mcl, top_y + int(torso_h * 0.32)), "side": "R"},
        # Lower lobes – 6th intercostal space
        {"name": "R Lower",      "pos": (mid_x - mcl, top_y + int(torso_h * 0.50)), "side": "R"},
        {"name": "L Lower",      "pos": (mid_x + mcl, top_y + int(torso_h * 0.50)), "side": "L"},
    ], (ls, rs, lh, rh)


def compute_cardiac_points(plm, w, h):
    """Anatomically precise cardiac auscultation sites."""
    ls, rs, lh, rh = get_body_anchors(plm, w, h)

    torso_h = int(((lh[1] - ls[1]) + (rh[1] - rs[1])) / 2)
    mid_x   = (ls[0] + rs[0]) // 2
    top_y   = (ls[1] + rs[1]) // 2

    mcl = int(abs(rs[0] - ls[0]) * 0.32)
    stb = int(abs(rs[0] - ls[0]) * 0.12)

    return [
        {"name": "Aortic",   "pos": (mid_x - stb, top_y + int(torso_h * 0.12)), "side": "R"},
        {"name": "Pulmonic", "pos": (mid_x + stb, top_y + int(torso_h * 0.12)), "side": "L"},
        {"name": "Erb's Pt", "pos": (mid_x + stb, top_y + int(torso_h * 0.22)), "side": "L"},
        {"name": "Tricuspid","pos": (mid_x + stb, top_y + int(torso_h * 0.32)), "side": "L"},
        {"name": "Mitral",   "pos": (mid_x + mcl, top_y + int(torso_h * 0.40)), "side": "L"},
    ], (ls, rs, lh, rh)


# ─── Drawing Functions ───────────────────────────────────────────────────────

def draw_torso_zone(frame, anchors):
    """Subtle translucent torso highlight with faint grid lines."""
    ls, rs, lh, rh = anchors
    pts = np.array([rs, ls, lh, rh], dtype=np.int32)
    overlay = frame.copy()
    cv2.fillPoly(overlay, [pts], (50, 45, 35))
    cv2.addWeighted(overlay, 0.18, frame, 0.82, 0, frame)
    cv2.polylines(frame, [pts], True, (80, 75, 65), 1, cv2.LINE_AA)

    # Faint horizontal grid lines across the torso
    mid_x = (ls[0] + rs[0]) // 2
    for t in [0.15, 0.30, 0.45, 0.60]:
        y = int(ls[1] + (lh[1] - ls[1]) * t)
        cv2.line(frame, (rs[0] + 5, y), (ls[0] - 5, y),
                 (55, 50, 45), 1, cv2.LINE_AA)


def draw_skeleton_minimal(frame, plm, w, h):
    """Thin, elegant skeleton overlay."""
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
    """Sleek hand wireframe."""
    CONNS = [
        (0,1),(1,2),(2,3),(3,4),(0,5),(5,6),(6,7),(7,8),
        (5,9),(9,10),(10,11),(11,12),(9,13),(13,14),(14,15),(15,16),
        (13,17),(17,18),(18,19),(19,20),(0,17),
    ]
    for a, b in CONNS:
        cv2.line(frame, px(hlm[a], w, h), px(hlm[b], w, h),
                 HAND_SKEL, 1, cv2.LINE_AA)
    for i in range(21):
        cv2.circle(frame, px(hlm[i], w, h), 2, ACCENT_CYAN, -1, cv2.LINE_AA)


def draw_target(frame, t, is_aligned, is_visited, mode_col, t_now):
    """Draw a single auscultation target with glow effects."""
    pos = t["pos"]

    if is_aligned:
        col = LUNG_ACTIVE if mode_col == "lung" else CARD_ACTIVE
        r = POINT_R + 3
        # Glow
        glow_circle(frame, pos, r, col, 0.35)
        # Pulsing outer ring
        pulse = int(5 * abs(math.sin(t_now * 4)))
        cv2.circle(frame, pos, r + 6 + pulse, col, 2, cv2.LINE_AA)
    elif is_visited:
        col = LUNG_VISITED if mode_col == "lung" else CARD_VISITED
        r = POINT_R
    else:
        col = LUNG_DEFAULT if mode_col == "lung" else CARD_DEFAULT
        r = POINT_R
        # Subtle breathing animation for unvisited
        breath = int(2 * abs(math.sin(t_now * 1.5)))
        cv2.circle(frame, pos, r + breath + 4, col, 1, cv2.LINE_AA)

    # Filled dot
    cv2.circle(frame, pos, r, col, -1, cv2.LINE_AA)
    # White border
    cv2.circle(frame, pos, r, WHITE, 1, cv2.LINE_AA)

    # Crosshair through the point
    cx, cy = pos
    cv2.line(frame, (cx - r - 4, cy), (cx - r, cy), DIM_WHITE, 1, cv2.LINE_AA)
    cv2.line(frame, (cx + r, cy), (cx + r + 4, cy), DIM_WHITE, 1, cv2.LINE_AA)
    cv2.line(frame, (cx, cy - r - 4), (cx, cy - r), DIM_WHITE, 1, cv2.LINE_AA)
    cv2.line(frame, (cx, cy + r), (cx, cy + r + 4), DIM_WHITE, 1, cv2.LINE_AA)

    # Label with a tiny background pill
    label = t["name"]
    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.35, 1)
    lx = cx - tw // 2
    ly = cy - r - 10
    # Background pill
    rounded_rect(frame, (lx - 4, ly - th - 2), (lx + tw + 4, ly + 3),
                 BG_PANEL, radius=4, alpha=0.65)
    cv2.putText(frame, label, (lx, ly),
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, WHITE, 1, cv2.LINE_AA)

    return is_aligned


def draw_hud(frame, visited, total, mode, fps, w, h, t_now):
    """Premium heads-up display panel."""
    panel_w = 240
    panel_h = 60 + total * 24 + 50
    px1, py1 = 12, 50
    px2, py2 = px1 + panel_w, py1 + panel_h

    rounded_rect(frame, (px1, py1), (px2, py2), BG_PANEL, radius=14, alpha=0.80)

    # Header line
    mode_label = "LUNG FIELDS" if mode == "lung" else "CARDIAC"
    mode_col = ACCENT_GREEN if mode == "lung" else ACCENT_AMBER
    cv2.putText(frame, mode_label, (px1 + 14, py1 + 24),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, mode_col, 1, cv2.LINE_AA)

    # Separator
    cv2.line(frame, (px1 + 14, py1 + 32), (px2 - 14, py1 + 32),
             (60, 60, 65), 1, cv2.LINE_AA)

    # Checklist
    y = py1 + 52
    done_count = 0
    names_sorted = sorted(visited.keys())
    for name in names_sorted:
        ok = visited[name]
        if ok:
            done_count += 1
        icon_col = ACCENT_GREEN if ok else (80, 80, 90)
        text_col = DIM_WHITE if ok else (100, 100, 110)

        # Check / empty circle icon
        icon_cx = px1 + 26
        if ok:
            cv2.circle(frame, (icon_cx, y - 4), 6, icon_col, -1, cv2.LINE_AA)
            # Tick mark
            cv2.line(frame, (icon_cx - 3, y - 4), (icon_cx - 1, y - 1), WHITE, 1, cv2.LINE_AA)
            cv2.line(frame, (icon_cx - 1, y - 1), (icon_cx + 4, y - 7), WHITE, 1, cv2.LINE_AA)
        else:
            cv2.circle(frame, (icon_cx, y - 4), 6, icon_col, 1, cv2.LINE_AA)

        cv2.putText(frame, name, (icon_cx + 12, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, text_col, 1, cv2.LINE_AA)
        y += 24

    # Progress bar
    bar_y = y + 8
    bar_x1 = px1 + 14
    bar_x2 = px2 - 14
    bar_w_total = bar_x2 - bar_x1
    progress = done_count / max(total, 1)
    bar_w_fill = int(bar_w_total * progress)

    cv2.rectangle(frame, (bar_x1, bar_y), (bar_x2, bar_y + 8), (50, 50, 55), -1)
    if bar_w_fill > 0:
        fill_col = ACCENT_GREEN if mode == "lung" else ACCENT_AMBER
        cv2.rectangle(frame, (bar_x1, bar_y), (bar_x1 + bar_w_fill, bar_y + 8),
                      fill_col, -1)
    cv2.rectangle(frame, (bar_x1, bar_y), (bar_x2, bar_y + 8), (70, 70, 75), 1)

    # Progress text
    pct_text = f"{int(progress * 100)}%"
    cv2.putText(frame, pct_text, (bar_x2 + 6, bar_y + 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.32, DIM_WHITE, 1, cv2.LINE_AA)


def draw_top_bar(frame, w, mode, fps):
    """Top status bar."""
    rounded_rect(frame, (0, 0), (w, 36), BG_PANEL, radius=0, alpha=0.70)

    # Title
    cv2.putText(frame, "AUSCULTATION TRACKER", (14, 24),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, ACCENT_CYAN, 1, cv2.LINE_AA)

    # Mode indicator
    mode_text = "[M] Lung" if mode == "lung" else "[M] Cardiac"
    cv2.putText(frame, mode_text, (w // 2 - 40, 24),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, DIM_WHITE, 1, cv2.LINE_AA)

    # FPS
    cv2.putText(frame, f"FPS {int(fps)}", (w - 80, 24),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, DIM_WHITE, 1, cv2.LINE_AA)

    # Controls hint
    cv2.putText(frame, "Q:Quit  R:Reset  M:Mode", (w - 220, 24),
                cv2.FONT_HERSHEY_SIMPLEX, 0.32, (100, 100, 100), 1, cv2.LINE_AA)


def draw_status_bar(frame, w, h, all_done, mode):
    """Bottom status banner."""
    bar_h = 40
    rounded_rect(frame, (0, h - bar_h), (w, h), BG_PANEL, radius=0, alpha=0.65)

    if all_done:
        text = "ALL POINTS CHECKED - EXAM COMPLETE"
        col  = ACCENT_GREEN
        # Animated checkmark
        t = time.time()
        scale = 0.55 + 0.03 * math.sin(t * 3)
        cv2.putText(frame, text, (w // 2 - 200, h - 12),
                    cv2.FONT_HERSHEY_SIMPLEX, scale, col, 2, cv2.LINE_AA)
    else:
        text = "Place hand on each target point to check"
        cv2.putText(frame, text, (w // 2 - 190, h - 14),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.48, DIM_WHITE, 1, cv2.LINE_AA)


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

    mode = "lung"                       # "lung" or "cardiac"
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

                draw_skeleton_minimal(frame, plm, w, h)

                # Compute targets based on mode
                if mode == "lung":
                    targets, anchors = compute_lung_points(plm, w, h)
                else:
                    targets, anchors = compute_cardiac_points(plm, w, h)

                draw_torso_zone(frame, anchors)

                # Sync visited dict with current targets
                current_names = {t["name"] for t in targets}
                visited = {k: v for k, v in visited.items() if k in current_names}
                for t in targets:
                    if t["name"] not in visited:
                        visited[t["name"]] = False

                # Hand positions
                hand_positions = []
                if hand_res.hand_landmarks:
                    for hlm in hand_res.hand_landmarks:
                        draw_hand(frame, hlm, w, h)
                        # Palm centre = landmark 9
                        hc = px(hlm[9], w, h)
                        hand_positions.append(hc)

                # Draw targets & check alignment
                for t in targets:
                    aligned = False
                    for hp in hand_positions:
                        if dist(hp, t["pos"]) < ALIGNMENT_RADIUS:
                            aligned = True
                            visited[t["name"]] = True
                            break

                    mode_col = "lung" if mode == "lung" else "cardiac"
                    draw_target(frame, t, aligned, visited.get(t["name"], False),
                                mode_col, t_now)

                    # Connection line when aligned
                    if aligned:
                        for hp in hand_positions:
                            if dist(hp, t["pos"]) < ALIGNMENT_RADIUS:
                                # Dashed-style line
                                cv2.line(frame, hp, t["pos"],
                                         ACCENT_GREEN if mode == "lung" else ACCENT_AMBER,
                                         2, cv2.LINE_AA)
                                break

                # HUD
                curr_time = time.time()
                fps = 1.0 / (curr_time - prev_time + 1e-9)
                prev_time = curr_time

                draw_hud(frame, visited, len(targets), mode, fps, w, h, t_now)
                draw_top_bar(frame, w, mode, fps)

                all_done = all(visited.values()) if visited else False
                draw_status_bar(frame, w, h, all_done, mode)

            else:
                # No body detected
                cv2.putText(frame, "Step into frame", (w // 2 - 100, h // 2 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, ACCENT_RED, 2, cv2.LINE_AA)
                cv2.putText(frame, "Ensure upper body is visible",
                            (w // 2 - 150, h // 2 + 25),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, DIM_WHITE, 1, cv2.LINE_AA)

                curr_time = time.time()
                fps = 1.0 / (curr_time - prev_time + 1e-9)
                prev_time = curr_time
                draw_top_bar(frame, w, mode, fps)

            cv2.imshow("Hand & Lung Alignment Tracker", frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            elif key == ord('r'):
                visited = {k: False for k in visited}
            elif key == ord('m'):
                mode = "cardiac" if mode == "lung" else "lung"
                visited = {}

    cap.release()
    cv2.destroyAllWindows()
    print("[INFO] Tracker closed.")


if __name__ == "__main__":
    main()
