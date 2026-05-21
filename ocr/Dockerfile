# OCR service image: Node + the native tesseract engine and English data.
FROM node:24-alpine

# tesseract-ocr: the OCR engine binary; tesseract-ocr-data-eng: English model.
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-eng

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

EXPOSE 4000
USER node
CMD ["node", "server.js"]
