import QRCode from "qrcode";

/// Render a QR code for the terminal (UTF-8 half blocks). Falls back to the plain text on error.
export async function terminalQr(text: string): Promise<string> {
  try {
    return await QRCode.toString(text, { type: "terminal", small: true, errorCorrectionLevel: "L" });
  } catch (e) {
    return `(QR rendering failed: ${(e as Error).message})\n${text}\n`;
  }
}
