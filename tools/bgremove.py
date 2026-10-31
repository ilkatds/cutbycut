"""Background removal for Sklejka (local neural network via rembg).

Image:  bgremove.py --model isnet-general-use --in photo.jpg --out photo.png
Frames: bgremove.py --model u2net_human_seg --dir FOLDER   (f_000001.png -> o_000001.png)
Prints "PROG i/n" lines for the progress bar.
"""
import argparse
import os
import sys

from PIL import Image
from rembg import new_session, remove


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="isnet-general-use")
    ap.add_argument("--in", dest="inp")
    ap.add_argument("--out")
    ap.add_argument("--dir")
    a = ap.parse_args()
    print("MSG Загружаю нейросеть " + a.model + " (первый раз скачивается)…", flush=True)
    session = new_session(a.model)
    if a.inp:
        img = Image.open(a.inp).convert("RGBA")
        remove(img, session=session).save(a.out)
        print("PROG 1/1", flush=True)
        return
    files = sorted(f for f in os.listdir(a.dir) if f.startswith("f_") and f.endswith(".png"))
    n = len(files)
    if not n:
        sys.exit("нет кадров")
    for i, f in enumerate(files, 1):
        img = Image.open(os.path.join(a.dir, f)).convert("RGBA")
        remove(img, session=session, post_process_mask=True).save(os.path.join(a.dir, "o_" + f[2:]))
        os.remove(os.path.join(a.dir, f))
        print(f"PROG {i}/{n}", flush=True)


if __name__ == "__main__":
    main()
