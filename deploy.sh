#/bin/bash -e
IMAGE_ID=gcr.io/bitrise-platform-staging/ascii-art:latest

docker build . -t $IMAGE_ID
docker push $IMAGE_ID

gcloud run deploy addons-ascii-art --image=$IMAGE_ID --allow-unauthenticated --project bitrise-platform-staging --platform=managed --region=us-central1

