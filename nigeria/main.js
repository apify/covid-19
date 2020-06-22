const Apify = require('apify');

const sourceUrl = 'https://covid19.ncdc.gov.ng/';
const LATEST = 'LATEST';

Apify.main(async () => {

    const kvStore = await Apify.openKeyValueStore('COVID-19-NG');
    const dataset = await Apify.openDataset('COVID-19-NG-HISTORY');

    console.log('Launching Puppeteer...');
    const browser = await Apify.launchPuppeteer();

    const page = await browser.newPage();
    await Apify.utils.puppeteer.injectJQuery(page);

    console.log('Going to the website...');
    await page.goto(sourceUrl), { waitUntil: 'networkidle0', timeout: 60000 };

    console.log('Getting data...');
    const result = await page.evaluate(() => {
        const now = new Date();

        const tested = $('body > div.pcoded-main-container > div > div.page-header > div.page-block > div > div.col-md-12.col-xl-3 > div > div > h2 > span').text();
        const infected = $("body > div.pcoded-main-container > div > div.page-header > div:nth-child(2) > div:nth-child(1) > div > div > h2 > span").text();
        const activeCases = $('body > div.pcoded-main-container > div > div.page-header > div:nth-child(2) > div:nth-child(2) > div > div > h2 > span').text();
        const recovered = $('body > div.pcoded-main-container > div > div.page-header > div:nth-child(2) > div:nth-child(3) > div > div > h2 > span').text();
        const deceased = $('body > div.pcoded-main-container > div > div.page-header > div:nth-child(2) > div:nth-child(4) > div > div > h2 > span').text();

        const regionsTableRows = Array.from(document.querySelectorAll("#custom1 > tbody > tr"));

        const regionData = [];

        for (const row of regionsTableRows) {
            const strip = (a) => Number(a.replace(",","").trim())
            const cells = Array.from(row.querySelectorAll("td")).map(td => td.textContent);
            regionData.push({ region: cells[0].trim(), labConfirmedCases: strip(cells[1]), onAdmissionCases: strip(cells[2]), discharged: strip(cells[3]), deaths: strip(cells[4]) });
        }


        const toInt = (a) => Number(a.replace(',', '').trim())

        const data = {
            tested: tested,
            infected: toInt(infected),
            recovered: toInt(recovered),
            deceased: toInt(deceased),
            country: 'Nigeria',
            historyData: 'https://api.apify.com/v2/datasets/ccY329O0ng68poTiX/items?format=json&clean=1',
            sourceUrl: 'https://covid19.ncdc.gov.ng/',
            lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
            lastUpdatedAtSource: 'N/A',
            readMe: 'https://github.com/zpelechova/covid-ng/blob/master/README.md',
            activeCases: toInt(activeCases.replace(",", "")),
            regions: regionData,
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
