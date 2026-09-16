import glob
import os

files = glob.glob('src/components/originkit/ui/hero-12/*.tsx')
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        lines = file.readlines()
    
    with open(f, 'w', encoding='utf-8') as file:
        for line in lines:
            if '"use client";' not in line:
                file.write(line)
