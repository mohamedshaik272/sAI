import cv2
import mediapipe as mp

_pose = None
_cap = None
_smoothed_x = 0.5


def start(camera_index: int = 0):
    global _pose, _cap
    _pose = mp.solutions.pose.Pose(
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )
    _cap = cv2.VideoCapture(camera_index)


def stop():
    global _pose, _cap
    if _cap:
        _cap.release()
    if _pose:
        _pose.close()


def get_position() -> float | None:
    global _smoothed_x
    if not _cap or not _pose:
        return None

    ret, frame = _cap.read()
    if not ret:
        return None

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = _pose.process(rgb)

    if results.pose_landmarks:
        nose = results.pose_landmarks.landmark[0]
        _smoothed_x = 0.7 * _smoothed_x + 0.3 * nose.x
        return _smoothed_x

    return None


def x_to_servo_angle(x: float) -> int:
    return int(180 - (x * 180))
