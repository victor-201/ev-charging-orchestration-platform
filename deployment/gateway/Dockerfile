FROM nginx:1.27-alpine

RUN apk add --no-cache ca-certificates gettext

COPY nginx.conf /etc/nginx/nginx.conf.template

EXPOSE 8000

STOPSIGNAL SIGQUIT

CMD PORT=${PORT:-8000} && export PORT && envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && nginx -g 'daemon off;'
