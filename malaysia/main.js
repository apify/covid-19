const Apify = require('apify');

const sourceUrl = 'http://covid-19.moh.gov.my/';
const LATEST = 'LATEST';

Apify.main(async () => {

    const kvStore = await Apify.openKeyValueStore('COVID-19-MY');
    const dataset = await Apify.openDataset('COVID-19-MY-HISTORY');

    console.log('Launching Puppeteer...');
    const browser = await Apify.launchPuppeteer({
        args: ['--disable-web-security', '--disable-features=site-per-process'],
    });

    const page = await browser.newPage();
    await Apify.utils.puppeteer.injectJQuery(page);

    console.log('Going to the website...');
    await page.goto(sourceUrl, { waitUntil: 'networkidle0', timeout: 60000 });

    console.log('Getting data...');

    const result = await page.evaluate(() => {
        const now = new Date();

        const iframeDocument = document.querySelector('#g-header .g-content iframe').contentDocument;
        const testedPositive = iframeDocument.querySelector('.InfographicEditor-Contents-Item:nth-child(29) span[data-text=true]').innerText;
        const recovered = iframeDocument.querySelector('.InfographicEditor-Contents-Item:nth-child(19) span[data-text=true]').innerText;
        const activeCases = iframeDocument.querySelector('.InfographicEditor-Contents-Item:nth-child(22) span[data-text=true]').innerText;
        const inICU = iframeDocument.querySelector('.InfographicEditor-Contents-Item:nth-child(35) .__ig-alignCenter:nth-child(2) span[data-text=true]').innerText;
        const respiratoryAid = iframeDocument.querySelector('.InfographicEditor-Contents-Item:nth-child(36) .__ig-alignCenter:nth-child(2) span[data-text=true]').innerText;
        const deceased = iframeDocument.querySelector('.InfographicEditor-Contents-Item:nth-child(20) span[data-text=true]').innerText;

        const data = {
            testedPositive: Number(testedPositive),
            recovered: Number(recovered),
            activeCases: Number(activeCases),
            inICU: Number(inICU),
            respiratoryAid: Number(respiratoryAid),
            deceased: Number(deceased),
            sourceUrl: 'http://covid-19.moh.gov.my/',
            lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
            readMe: 'https://apify.com/zuzka/covid-my',
        };
        return data;

    });

    console.log(result)

    let latest = await kvStore.getValue(LATEST);
    if (!latest) {
        await kvStore.setValue('LATEST', result);
        latest = result;
    }
    delete latest.lastUpdatedAtApify;
    const actual = Object.assign({}, result);
    delete actual.lastUpdatedAtApify;

    if (JSON.stringify(latest) !== JSON.stringify(actual)) {
        await dataset.pushData(result);
    }

    await kvStore.setValue('LATEST', result);
    await Apify.pushData(result);

    console.log('Closing Puppeteer...');
    await browser.close();
    console.log('Done.');
});
