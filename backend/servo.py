import serial
import time
import threading
import tracking
import config
from tracking import MovementDirection

_serial = None
_running = False
_thread = None


def connect(port: str = None, baud: int = 9600):
    port = port or config.SERIAL_PORT
    global _serial
    _serial = serial.Serial(port, baud, timeout=1)
    time.sleep(2)


def disconnect():
    global _serial
    if _serial:
        _serial.close()
        _serial = None


def turn_left():
    if _serial:
        _serial.write(b'l')


def turn_right():
    if _serial:
        _serial.write(b'r')


def _tracking_loop():
    global _running
    while _running:
        h_dir, _ = tracking.get_movement_direction()

        if h_dir == MovementDirection.LEFT:
            turn_left()
        elif h_dir == MovementDirection.RIGHT:
            turn_right()

        time.sleep(0.1)


def start_tracking(serial_port: str = None, camera_index: int = None):
    global _running, _thread

    connect(serial_port or config.SERIAL_PORT)
    tracking.start(camera_index if camera_index is not None else config.CAMERA_INDEX)

    _running = True
    _thread = threading.Thread(target=_tracking_loop, daemon=True)
    _thread.start()


def stop_tracking():
    global _running, _thread
    _running = False
    if _thread:
        _thread.join(timeout=1)
        _thread = None
    tracking.stop()
    disconnect()
