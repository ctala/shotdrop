// ?lang=es|en picks the language of the asset; image paths with {lang} follow it.
const lang = new URLSearchParams(location.search).get('lang') === 'es' ? 'es' : 'en';
document.documentElement.lang = lang;
for (const img of document.querySelectorAll('img[data-src]')) img.src = img.dataset.src.replaceAll('{lang}', lang);
