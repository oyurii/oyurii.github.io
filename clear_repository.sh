#!/bin/sh

rm -rf .git
git init
git add . 
git commit -m "First commit"
git remote add origin ssh://git@github.com/oyurii/oyurii.github.io
git remote set-url origin ssh://git@github.com/oyurii/oyurii.github.io
git push -u origin --all -f
