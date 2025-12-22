#!/bin/bash

manifest_file="./manifest.json.firefox"
license_file="./LICENSE"
license_attr_file="./LICENSE-ATTRIBUTION.txt"
images_folder="./images"
ui_folder="./ui"
service_worker_folder="./service-worker"
destination_folder="./dist-firefox"

# Delete the existing dist-firefox folder
rm -rf "$destination_folder"

# Run npm run build in content-scripts folder
cd content-scripts
npm run build
cd ..

# Run npm run build in service-worker folder
cd service-worker
npm run build
cd ..

# Run npm run build in ui folder
cd ui
npm run build
cd ..

# Create the destination folder if it doesn't exist
mkdir -p "$destination_folder/images"
mkdir -p "$destination_folder/service-worker"
mkdir -p "$destination_folder/ui/settings"
mkdir -p "$destination_folder/ui/popup"

# Copy the contents of the images folder
cp "$manifest_file" "$destination_folder/manifest.json"
cp "$license_file" "$destination_folder/LICENSE"
cp "$license_attr_file" "$destination_folder/LICENSE-ATTRIBUTION.txt"
cp -r "$images_folder"/* "$destination_folder/images"
cp "$service_worker_folder/index.html" "$destination_folder/service-worker/index.html"
# Copy HTML files from the ui folder and its subfolders
# find "$ui_folder/settings" -name "*.html" -exec cp {} "$destination_folder/settings/{}" \;
# find "$ui_folder/popup" -name "*.html" -exec cp {} "$destination_folder/popup/{}" \;
cp -v "$ui_folder"/settings/*.html "$destination_folder/ui/settings/"
cp -v "$ui_folder"/popup/*.html "$destination_folder/ui/popup/"

echo "Files copied to ./dist-firefox folder."

mkdir -p ./bin

cd "$destination_folder"

zip -r -q -FS ../bin/ytc.xpi *
