"""TSPL probe for the Xprinter XP-D463B (or any TSPL/TSPL2 label printer).

Usage:
    uv run python sandbox/tspl_probe.py COM7
    uv run python sandbox/tspl_probe.py COM7 --baud 115200
    uv run python sandbox/tspl_probe.py COM7 --test beep
    uv run python sandbox/tspl_probe.py COM7 --test selftest
    uv run python sandbox/tspl_probe.py COM7 --test label

Tests:
    beep      Buzzer chirp via `SOUND`. Cheapest "is the printer listening?" check.
    selftest  `SELFTEST` — prints a config/diagnostic label.
    label     Tiny 40x30 mm "HELLO" label using `SIZE` + `GAP` + `TEXT` + `PRINT`.
              Adjust --width-mm / --height-mm if your stock differs.
    all       Run beep, then selftest, then label, with pauses.

If the printer ignores everything but BT is paired, try --baud 115200
(some Xprinter BT modules ship at that rate). If still nothing, the
Outgoing vs Incoming COM port is the next thing to suspect — check
Settings → Bluetooth → More Bluetooth settings → COM Ports tab.
"""

from __future__ import annotations

import argparse
import sys
import time

import serial


def send(ser: serial.Serial, line: str) -> None:
    """TSPL commands are CR/LF terminated."""
    payload = (line + "\r\n").encode("ascii")
    print(f">>> {line}")
    ser.write(payload)
    ser.flush()


def beep(ser: serial.Serial) -> None:
    # SOUND <level 1-9>,<interval in 0.01s units>
    send(ser, "SOUND 5,100")


def selftest(ser: serial.Serial) -> None:
    send(ser, "SELFTEST")


def label(ser: serial.Serial, width_mm: float, height_mm: float) -> None:
    send(ser, "CLS")
    send(ser, f"SIZE {width_mm} mm,{height_mm} mm")
    send(ser, "GAP 2 mm,0 mm")
    send(ser, "DIRECTION 1")
    send(ser, "REFERENCE 0,0")
    send(ser, "DENSITY 8")
    send(ser, "SPEED 4")
    # TEXT x,y,"font",rotation,x-mul,y-mul,"text"
    # Font "3" = 24x24 built-in. Rotation 0. Magnify 1x1.
    send(ser, 'TEXT 30,30,"3",0,1,1,"HELLO"')
    send(ser, 'TEXT 30,80,"2",0,1,1,"XP-D463B"')
    send(ser, "PRINT 1,1")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("port", help="Serial port (e.g. COM7)")
    ap.add_argument("--baud", type=int, default=9600)
    ap.add_argument(
        "--test",
        choices=("beep", "selftest", "label", "all"),
        default="beep",
    )
    ap.add_argument("--width-mm", type=float, default=40.0)
    ap.add_argument("--height-mm", type=float, default=30.0)
    args = ap.parse_args()

    print(f"Opening {args.port} @ {args.baud} 8N1…")
    try:
        ser = serial.Serial(args.port, args.baud, timeout=2, write_timeout=5)
    except serial.SerialException as e:
        print(f"ERROR: could not open {args.port}: {e}", file=sys.stderr)
        return 1

    try:
        if args.test in ("beep", "all"):
            beep(ser)
            time.sleep(1.0)
        if args.test in ("selftest", "all"):
            selftest(ser)
            time.sleep(2.0)
        if args.test in ("label", "all"):
            label(ser, args.width_mm, args.height_mm)
            time.sleep(1.0)
        # Drain anything the printer wrote back (status bytes etc.).
        leftover = ser.read(ser.in_waiting or 0)
        if leftover:
            print(f"<<< {leftover!r}")
    finally:
        ser.close()
        print("Closed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
