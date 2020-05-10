const Apify = require('apify');

const sourceUrl = 'http://publichealth.lacounty.gov/media/Coronavirus/';
const LATEST = 'LATEST';

Apify.main(async () => {

    const kvStore = await Apify.openKeyValueStore('coronavirusLA');
    const dataset = await Apify.openDataset('coronavirusLA');

    console.log('Launching Puppeteer...');
    const browser = await Apify.launchPuppeteer();

    const page = await browser.newPage();
    await Apify.utils.puppeteer.injectJQuery(page);

    console.log('Going to the website...');
    await page.goto(sourceUrl), { waitUntil: 'networkidle0', timeout: 60000 };

    console.log('Getting data...');
    const result = await page.evaluate(() => {
        const now = new Date();

        const infected = $('#ctn').text();
        const deceased = $('#det').text();

        const toInt = (string) => Number(string.replace(',', ''))
        const result = {
            infected: toInt(infected),
            deceased: toInt(deceased),
            sourceUrl: 'http://publichealth.lacounty.gov/media/Coronavirus/',
            lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
            readMe: 'https://apify.com/jakubbalada/coronavirus-la',
        };
        return result;
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
