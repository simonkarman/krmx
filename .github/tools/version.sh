#!/bin/bash
echo "Verifying that all packages have the same major and minor version (patch version can be different)..."
version_base=$(cat package.json | jq '.version' --raw-output)
version_base=${version_base%.*}
echo "Base Version: $version_base"

find . -name "package.json" -type f -not -path "*/node_modules/*" -not -path "*/.next/*" -not -path "*/state/*" | sort | while read -r file; do
  name_pkg=$(cat $file | jq '.name' --raw-output)
  full_version_pkg=$(cat $file | jq '.version' --raw-output)
  version_pkg="${full_version_pkg%.*}"

  if [ "$version_base" != "$version_pkg" ]; then
    echo "- $name_pkg: mismatch! (at $full_version_pkg)"
    exit 1
  else
    echo "- $name_pkg: correct ($full_version_pkg)"
  fi
done
