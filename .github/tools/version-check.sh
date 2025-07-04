echo "Verifying that all packages have the same major and minor version (patch version can be different)..."
version_base=$(cat package.json | jq '.version' --raw-output)
echo "Base Version: $version_base"

find . -name "package.json" -type f -not -path "./package.json" -not -path "*/node_modules/*" -not -path "*/.next/*" -not -path "*/state/*" | sort | while read -r file; do
  name_pkg=$(cat $file | jq '.name' --raw-output)
  version_pkg_original=$(cat $file | jq '.version' --raw-output)
  version_pkg="${version_pkg_original%.*}"

  if [ "$version_base" != "$version_pkg" ]; then
    echo "- $name_pkg: ❌ mismatch! (at $version_pkg_original)"
    exit 1
  else
    echo "- $name_pkg: ✅ correct at $version_pkg_original"
  fi
done
