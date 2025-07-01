#!/usr/bin/env python3
import sys

def main():
    # Print a greeting...
    print("✅ Hello from test.py!")

    # …and echo any arguments passed in
    if len(sys.argv) > 1:
        print("Received args:", " ".join(sys.argv[1:]))
    else:
        print("No arguments received.")

    return "Done!"    
if __name__ == "__main__":
    main()
