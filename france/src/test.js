const Tesseract = require('tesseract.js');

// const rectangleSizeLength = 420;
// Tesseract.recognize(
//     'https://www.santepubliquefrance.fr/var/site/storage/images/5/1/9/4/2494915-78-fre-FR/vignette-coronavirus-250320.jpg',
//     'eng',{
//         rectangle:{ top: 490, left: 2 * rectangleSizeLength, width: rectangleSizeLength, height: 95 },
//         classify_bln_numeric_mode: 1, tessedit_char_whitelist: '0123456789',
//     }
// ).then(({ data }) => {
//     console.log(data.text);
// })

const { createWorker } = Tesseract;
(async () => {
    const worker = createWorker();
    await worker.load();
    await worker.loadLanguage('fra');
    await worker.initialize('fra');
    const { data: { text } } = await worker.recognize('https://www.santepubliquefrance.fr/var/site/storage/images/5/1/9/4/2494915-78-fre-FR/vignette-coronavirus-250320.jpg', {
        rectangle:{ top: 490, left: 2 * rectangleSizeLength, width: rectangleSizeLength, height: 95 },
        classify_bln_numeric_mode: 1, tessedit_char_whitelist: '0123456789',
    });
    console.log(text)
    console.log(parseInt(text.replace(/\D/g, '')));
})();
