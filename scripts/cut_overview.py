# Cuts individual objects out of the opaque overview sheet with GrabCut.
# Each entry is a rough bounding box (x0, y0, x1, y1) in the 1536x1024 sheet; GrabCut refines it.
# Output: asset-sources/overview-cut/<name>.png (RGBA, trimmed).
import sys, os
import cv2
import numpy as np

SRC = os.path.join(os.path.dirname(__file__), "..", "asset-sources", "v3", "source", "generated_v3_overview.png")
OUT = os.path.join(os.path.dirname(__file__), "..", "asset-sources", "overview-cut")

BOXES = {
    # Buddhas (row 3, y 250-445)
    "buddha-thich-ca": (8, 250, 138, 448),
    "buddha-a-di-da": (142, 250, 262, 448),
    "buddha-back": (266, 250, 372, 448),
    "quan-am-white": (376, 250, 492, 448),
    "quan-am-blue": (498, 250, 602, 448),
    "quan-am-cream": (603, 250, 705, 448),
    "quan-am-gold": (706, 250, 800, 448),
    "dia-tang-red": (806, 250, 905, 448),
    "bodhisattva-red": (910, 250, 1005, 448),
    "bodhisattva-staff": (1010, 250, 1100, 448),
    "bodhisattva-back": (1105, 250, 1210, 448),
    # Guardians (row 3 right and row 5 left)
    "guardian-blue-1": (1232, 255, 1345, 448),
    "guardian-blue-2": (1345, 255, 1440, 448),
    "guardian-blue-3": (1440, 255, 1530, 448),
    "hop-phap-1": (8, 600, 128, 760),
    "hop-phap-2": (128, 600, 245, 760),
    "hop-phap-3": (245, 600, 356, 760),
    "hop-phap-4": (356, 600, 472, 760),
    "di-lac": (476, 600, 602, 760),
    # Dragons and beasts (row 4, y 450-605)
    "dragon-gold": (8, 450, 152, 605),
    "dragon-blue": (160, 450, 302, 605),
    "dragon-white": (302, 450, 452, 605),
    "dragon-red": (440, 450, 614, 605),
    "dragon-jade": (606, 450, 772, 605),
    "phoenix": (758, 450, 932, 605),
    "qilin-green": (940, 450, 1078, 605),
    "qilin-gold": (1088, 450, 1218, 605),
    "deer-white": (1218, 450, 1322, 605),
    "elephant": (1322, 450, 1428, 605),
    "tortoise": (1428, 450, 1530, 605),
    # Apsaras (row 5, y 600-760)
    "apsara-1": (596, 600, 702, 760),
    "apsara-2": (704, 600, 792, 760),
    "apsara-3": (784, 600, 868, 760),
    # Temples and gates (row 5 right)
    "temple-main": (866, 600, 1088, 760),
    "gate-stone": (1092, 600, 1262, 760),
    "pagoda-small": (1262, 600, 1316, 760),
    "gate-small": (1318, 600, 1446, 760),
    "pagoda-tall": (1446, 600, 1530, 760),
    # Lotus, trees and rock (row 6, y 760-880)
    "lotus-pink-pair": (212, 762, 342, 880),
    "lotus-white": (342, 762, 425, 880),
    "lotus-green": (425, 762, 490, 880),
    "lotus-pink-single": (490, 762, 562, 880),
    "tree-pink": (596, 762, 706, 880),
    "tree-green": (706, 762, 832, 880),
    "bamboo": (828, 762, 872, 880),
    "rock-waterfall": (868, 762, 1052, 880),
    "cloud-gold": (1022, 762, 1118, 830),
    "cloud-blue-1": (1118, 762, 1248, 840),
    "cloud-blue-2": (1252, 762, 1388, 840),
    "halo-gold": (1362, 762, 1442, 852),
    "halo-pink": (1446, 762, 1532, 852),
    # Lanterns, banners and instruments (row 7, y 880-1005)
    "lantern-pair": (662, 880, 730, 1002),
    "banner-red-1": (742, 880, 802, 1002),
    "banner-gold": (798, 880, 852, 1002),
    "banner-red-2": (848, 880, 906, 1002),
    "banner-red-3": (902, 880, 958, 1002),
    "scroll-banner": (938, 880, 1002, 1002),
    "lantern-stand": (988, 880, 1044, 1002),
    "drum": (1046, 880, 1124, 1002),
    "lantern-tall": (1138, 880, 1190, 1002),
    "bell-stand": (1192, 880, 1240, 1002),
    "lamp-small": (1244, 880, 1288, 1002),
}

def cut(name, box, img):
    x0, y0, x1, y1 = box
    crop = img[y0:y1, x0:x1].copy()
    h, w = crop.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    rect = (2, 2, w - 4, h - 4)
    cv2.grabCut(crop, mask, rect, bgd, fgd, 6, cv2.GC_INIT_WITH_RECT)
    alpha = np.where((mask == 1) | (mask == 3), 255, 0).astype(np.uint8)
    # Keep only the largest connected foreground blob, then fill its holes.
    n, lab, stats, _ = cv2.connectedComponentsWithStats(alpha, 8)
    if n <= 1:
        return None
    best = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    alpha = np.where(lab == best, 255, 0).astype(np.uint8)
    rgba = cv2.cvtColor(crop, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = alpha
    ys, xs = np.where(alpha > 0)
    if len(xs) == 0:
        return None
    rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return rgba

def main():
    img = cv2.imread(SRC, cv2.IMREAD_COLOR)
    if img is None:
        sys.exit("cannot read overview")
    os.makedirs(OUT, exist_ok=True)
    for name, box in BOXES.items():
        out = cut(name, box, img)
        if out is None:
            print("FAIL", name)
            continue
        cv2.imwrite(os.path.join(OUT, name + ".png"), out)
        print("ok", name, out.shape[1], "x", out.shape[0])

if __name__ == "__main__":
    main()
