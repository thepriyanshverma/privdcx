FROM prom/prometheus:latest

# Bake config into the image to avoid Windows bind-mount path issues.
COPY prometheus.yml /etc/prometheus/prometheus.yml
