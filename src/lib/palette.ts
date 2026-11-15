/** Choose black or white by relative luminance, including saturated user colors. */
export function readableForeground(color: string): "#000000" | "#FFFFFF" {
  let hex = color.replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) hex = [...hex].map((character) => character.repeat(2)).join("");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#FFFFFF";
  const channels = [0, 2, 4].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#FFFFFF";
}
