export const hexToRgb = (hex: string): [number, number, number] => {
    const value = hex.replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(value)) {
        throw new Error(`Invalid hex color: "${hex}"`);
    }
    return [
        parseInt(value.substring(0, 2), 16) / 255,
        parseInt(value.substring(2, 4), 16) / 255,
        parseInt(value.substring(4, 6), 16) / 255,
    ];
};
