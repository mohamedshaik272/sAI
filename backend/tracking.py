import cv2
import mediapipe as mp
from enum import Enum
from typing import Optional, Tuple
import os

BaseOptions = mp.tasks.BaseOptions
PoseLandmarker = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode


class MovementDirection(Enum):
    LEFT = "left"
    RIGHT = "right"
    UP = "up"
    DOWN = "down"
    STATIONARY = "stationary"


_landmarker = None
_cap = None
_smoothed_x = 0.5
_smoothed_y = 0.5
_prev_x = None
_prev_y = None
_movement_threshold = 0.02
_frame_timestamp_ms = 0

_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pose_landmarker_lite.task")


def start(camera_index: int = 0, movement_threshold: float = 0.02):
    global _landmarker, _cap, _movement_threshold, _frame_timestamp_ms
    _movement_threshold = movement_threshold
    _frame_timestamp_ms = 0

    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=_MODEL_PATH),
        running_mode=VisionRunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    _landmarker = PoseLandmarker.create_from_options(options)
    _cap = cv2.VideoCapture(camera_index)


def stop():
    global _landmarker, _cap
    if _cap:
        _cap.release()
        _cap = None
    if _landmarker:
        _landmarker.close()
        _landmarker = None


def get_movement_direction() -> Tuple[Optional[MovementDirection], Optional[MovementDirection]]:
    global _smoothed_x, _smoothed_y, _prev_x, _prev_y, _frame_timestamp_ms

    if not _cap or not _landmarker:
        return None, None

    ret, frame = _cap.read()
    if not ret:
        return None, None

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    _frame_timestamp_ms += 33
    results = _landmarker.detect_for_video(mp_image, _frame_timestamp_ms)

    if not results.pose_landmarks:
        return None, None

    nose = results.pose_landmarks[0][0]
    _smoothed_x = 0.7 * _smoothed_x + 0.3 * nose.x
    _smoothed_y = 0.7 * _smoothed_y + 0.3 * nose.y

    horizontal_dir = None
    vertical_dir = None

    if _prev_x is not None:
        delta_x = _smoothed_x - _prev_x
        if abs(delta_x) > _movement_threshold:
            horizontal_dir = MovementDirection.RIGHT if delta_x > 0 else MovementDirection.LEFT
        else:
            horizontal_dir = MovementDirection.STATIONARY

    if _prev_y is not None:
        delta_y = _smoothed_y - _prev_y
        if abs(delta_y) > _movement_threshold:
            vertical_dir = MovementDirection.DOWN if delta_y > 0 else MovementDirection.UP
        else:
            vertical_dir = MovementDirection.STATIONARY

    _prev_x = _smoothed_x
    _prev_y = _smoothed_y

    return horizontal_dir, vertical_dir
