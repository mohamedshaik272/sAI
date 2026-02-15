import cv2
import mediapipe as mp
from enum import Enum
from typing import Optional, Tuple
import time
import os

BaseOptions = mp.tasks.BaseOptions
PoseLandmarker = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

class MovementDirection(Enum):
    """Enum for movement directions"""
    LEFT = "left"
    RIGHT = "right"
    UP = "up"
    DOWN = "down"
    STATIONARY = "stationary"

class FrameStatus(Enum):
    """Enum for user frame status"""
    IN_FRAME = "in_frame"
    OUT_OF_FRAME = "out_of_frame"
    PARTIALLY_VISIBLE = "partially_visible"

_landmarker = None
_cap = None
_smoothed_x = 0.5
_smoothed_y = 0.5
_prev_x = None
_prev_y = None
_movement_threshold = 0.02
_frame_boundary_margin = 0.1
_out_of_frame_start_time = None
_warning_cooldown = 3.0
_last_warning_time = 0
_frame_timestamp_ms = 0

_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pose_landmarker_lite.task")


def start(camera_index: int = 0, movement_threshold: float = 0.02,
          frame_margin: float = 0.1, warning_cooldown: float = 3.0):
    """
    Initialize the pose tracking system.

    Args:
        camera_index: Camera device index (default 0)
        movement_threshold: Minimum movement to detect direction (default 0.02)
        frame_margin: Margin from frame edges to trigger warnings (default 0.1)
        warning_cooldown: Seconds between frame warnings (default 3.0)
    """
    global _landmarker, _cap, _movement_threshold, _frame_boundary_margin, _warning_cooldown, _frame_timestamp_ms
    _movement_threshold = movement_threshold
    _frame_boundary_margin = frame_margin
    _warning_cooldown = warning_cooldown
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
    """Release camera and pose detection resources"""
    global _landmarker, _cap
    if _cap:
        _cap.release()
        _cap = None
    if _landmarker:
        _landmarker.close()
        _landmarker = None


def _detect(frame):
    """Run pose detection on a BGR frame and return the result."""
    global _frame_timestamp_ms
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    _frame_timestamp_ms += 33  # ~30 FPS interval
    return _landmarker.detect_for_video(mp_image, _frame_timestamp_ms)


def get_position() -> Optional[float]:
    """
    Get the smoothed x-position of the user's nose.

    Returns:
        Smoothed x-coordinate (0.0 to 1.0) or None if tracking failed
    """
    global _smoothed_x
    if not _cap or not _landmarker:
        return None

    ret, frame = _cap.read()
    if not ret:
        return None

    results = _detect(frame)

    if results.pose_landmarks:
        nose = results.pose_landmarks[0][0]
        _smoothed_x = 0.7 * _smoothed_x + 0.3 * nose.x
        return _smoothed_x

    return None


def get_movement_direction() -> Tuple[Optional[MovementDirection], Optional[MovementDirection]]:
    """
    Track user movement and return horizontal and vertical directions.

    Returns:
        Tuple of (horizontal_direction, vertical_direction)
        Each can be MovementDirection enum value or None if no movement detected
    """
    global _smoothed_x, _smoothed_y, _prev_x, _prev_y

    if not _cap or not _landmarker:
        return None, None

    ret, frame = _cap.read()
    if not ret:
        return None, None

    results = _detect(frame)

    if not results.pose_landmarks:
        return None, None

    nose = results.pose_landmarks[0][0]
    current_x = nose.x
    current_y = nose.y

    _smoothed_x = 0.7 * _smoothed_x + 0.3 * current_x
    _smoothed_y = 0.7 * _smoothed_y + 0.3 * current_y

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


def check_frame_status() -> Tuple[FrameStatus, Optional[str]]:
    """
    Check if user is within frame boundaries and generate warning messages.

    Returns:
        Tuple of (FrameStatus, warning_message)
        warning_message is None if user is properly in frame
    """
    global _out_of_frame_start_time, _last_warning_time

    if not _cap or not _landmarker:
        return FrameStatus.OUT_OF_FRAME, "Camera not initialized"

    ret, frame = _cap.read()
    if not ret:
        return FrameStatus.OUT_OF_FRAME, "Cannot read from camera"

    results = _detect(frame)

    current_time = time.time()

    if not results.pose_landmarks:
        if _out_of_frame_start_time is None:
            _out_of_frame_start_time = current_time

        if current_time - _last_warning_time > _warning_cooldown:
            _last_warning_time = current_time
            return FrameStatus.OUT_OF_FRAME, "⚠️ Please move back into the camera frame"
        return FrameStatus.OUT_OF_FRAME, None

    _out_of_frame_start_time = None

    landmarks = results.pose_landmarks[0]
    nose = landmarks[0]
    left_shoulder = landmarks[11]
    right_shoulder = landmarks[12]

    avg_x = (nose.x + left_shoulder.x + right_shoulder.x) / 3
    avg_y = (nose.y + left_shoulder.y + right_shoulder.y) / 3

    warning_message = None
    status = FrameStatus.IN_FRAME

    if avg_x < _frame_boundary_margin:
        status = FrameStatus.PARTIALLY_VISIBLE
        if current_time - _last_warning_time > _warning_cooldown:
            warning_message = "⚠️ You're too far left - please move right"
            _last_warning_time = current_time
    elif avg_x > (1 - _frame_boundary_margin):
        status = FrameStatus.PARTIALLY_VISIBLE
        if current_time - _last_warning_time > _warning_cooldown:
            warning_message = "⚠️ You're too far right - please move left"
            _last_warning_time = current_time
    elif avg_y < _frame_boundary_margin:
        status = FrameStatus.PARTIALLY_VISIBLE
        if current_time - _last_warning_time > _warning_cooldown:
            warning_message = "⚠️ You're too high - please move down"
            _last_warning_time = current_time
    elif avg_y > (1 - _frame_boundary_margin):
        status = FrameStatus.PARTIALLY_VISIBLE
        if current_time - _last_warning_time > _warning_cooldown:
            warning_message = "⚠️ You're too low - please move up"
            _last_warning_time = current_time

    return status, warning_message


def get_full_tracking_data() -> dict:
    """
    Get comprehensive tracking data including position, movement, and frame status.

    Returns:
        Dictionary containing:
        - position: (x, y) smoothed coordinates
        - movement: (horizontal_direction, vertical_direction)
        - frame_status: FrameStatus enum
        - warning: Warning message or None
        - servo_angle: Calculated servo angle based on x position
    """
    if not _cap or not _landmarker:
        return {
            'position': None,
            'movement': (None, None),
            'frame_status': FrameStatus.OUT_OF_FRAME,
            'warning': "Tracking not initialized",
            'servo_angle': None
        }

    ret, frame = _cap.read()
    if not ret:
        return {
            'position': None,
            'movement': (None, None),
            'frame_status': FrameStatus.OUT_OF_FRAME,
            'warning': "Cannot read from camera",
            'servo_angle': None
        }

    results = _detect(frame)

    horizontal_dir, vertical_dir = _update_movement(results)
    frame_status, warning = _check_boundaries(results)

    position = (_smoothed_x, _smoothed_y) if results.pose_landmarks else None
    servo_angle = x_to_servo_angle(_smoothed_x) if results.pose_landmarks else None

    return {
        'position': position,
        'movement': (horizontal_dir, vertical_dir),
        'frame_status': frame_status,
        'warning': warning,
        'servo_angle': servo_angle
    }


def _update_movement(results) -> Tuple[Optional[MovementDirection], Optional[MovementDirection]]:
    """Internal helper to update movement tracking"""
    global _smoothed_x, _smoothed_y, _prev_x, _prev_y

    if not results.pose_landmarks:
        return None, None

    nose = results.pose_landmarks[0][0]
    current_x = nose.x
    current_y = nose.y

    _smoothed_x = 0.7 * _smoothed_x + 0.3 * current_x
    _smoothed_y = 0.7 * _smoothed_y + 0.3 * current_y

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


def _check_boundaries(results) -> Tuple[FrameStatus, Optional[str]]:
    """Internal helper to check frame boundaries"""
    global _out_of_frame_start_time, _last_warning_time

    current_time = time.time()

    if not results.pose_landmarks:
        if _out_of_frame_start_time is None:
            _out_of_frame_start_time = current_time

        if current_time - _last_warning_time > _warning_cooldown:
            _last_warning_time = current_time
            return FrameStatus.OUT_OF_FRAME, "⚠️ Please move back into the camera frame"
        return FrameStatus.OUT_OF_FRAME, None

    _out_of_frame_start_time = None

    landmarks = results.pose_landmarks[0]
    nose = landmarks[0]
    left_shoulder = landmarks[11]
    right_shoulder = landmarks[12]

    avg_x = (nose.x + left_shoulder.x + right_shoulder.x) / 3
    avg_y = (nose.y + left_shoulder.y + right_shoulder.y) / 3

    warning_message = None
    status = FrameStatus.IN_FRAME

    if avg_x < _frame_boundary_margin:
        status = FrameStatus.PARTIALLY_VISIBLE
        if current_time - _last_warning_time > _warning_cooldown:
            warning_message = "⚠️ You're too far left - please move right"
            _last_warning_time = current_time
    elif avg_x > (1 - _frame_boundary_margin):
        status = FrameStatus.PARTIALLY_VISIBLE
        if current_time - _last_warning_time > _warning_cooldown:
            warning_message = "⚠️ You're too far right - please move left"
            _last_warning_time = current_time
    elif avg_y < _frame_boundary_margin:
        status = FrameStatus.PARTIALLY_VISIBLE
        if current_time - _last_warning_time > _warning_cooldown:
            warning_message = "⚠️ You're too high - please move down"
            _last_warning_time = current_time
    elif avg_y > (1 - _frame_boundary_margin):
        status = FrameStatus.PARTIALLY_VISIBLE
        if current_time - _last_warning_time > _warning_cooldown:
            warning_message = "⚠️ You're too low - please move up"
            _last_warning_time = current_time

    return status, warning_message


def x_to_servo_angle(x: float) -> int:
    """Convert x-coordinate (0.0-1.0) to servo angle (0-180)"""
    return int(180 - (x * 180))
