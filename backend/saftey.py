from pathlib import Path
import runpy


if __name__ == "__main__":
    corrected_script = Path(__file__).with_name("safety.py")
    runpy.run_path(str(corrected_script), run_name="__main__")
