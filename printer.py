import serial

ESC = b"\x1b"
AT = b"\x40"
GS = b"\x1d"
FF = b"\x0c"
W = b"\x57"

class LabelPrinter:
    DOTS_PER_MM = 8
    MAX_WIDTH_DOTS = 384  # 48mm * 8

    def __init__(self,
        port: str,
        baud: int = 9600,
        label_width_mm: int = MAX_WIDTH_DOTS/DOTS_PER_MM,
        label_height_mm: int = 30
 ):
        self.label_height_mm = label_width_mm
        self.label_width_mm = label_height_mm
        self.ser = serial.Serial(port, baud)
        self.set_label_size(label_width_mm, label_height_mm)

    def send(self, *commands: bytes):
        if len(commands) > 1:
            data = b''.join(commands)
            print(f"Sending [{len(commands)}] commands, data: {data}")
            self.ser.write(data)
        else:
            raise ValueError("Invalid command")

    def set_label_size(self, width_mm, height_mm):
        self.label_width_mm = width_mm
        self.label_height_mm = height_mm
        print(f"Setting label size to {width_mm}x{height_mm}")

        width_dots = int(width_mm * self.DOTS_PER_MM)

        # Set print area width: GS W nL nH
        self.send(GS, W, bytes([width_dots & 0xFF, (width_dots >> 8) & 0xFF]))



    @property
    def width_dots(self):
        return int(self.label_width_mm * LabelPrinter.DOTS_PER_MM)

    @property
    def height_dots(self):
        return int(self.label_height_mm * LabelPrinter.DOTS_PER_MM)

    def write_text(self, text: str):
        self.ser.write(text.encode() + b'\n')

    def next_label(self):
        self.send(GS, FF)

    def close(self):
        self.ser.close()
        print("Printer Serial closed")