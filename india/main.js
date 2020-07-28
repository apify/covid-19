const Apify = require('apify');

const sourceUrl = 'https://www.mohfw.gov.in/';
const LATEST = 'LATEST';

Apify.main(async () => {

    const kvStore = await Apify.openKeyValueStore('COVID-19-IN');
    const dataset = await Apify.openDataset('COVID-19-IN-HISTORY');
    const { email } = await Apify.getValue('INPUT');

    console.log('Launching Puppeteer...');
    const browser = await Apify.launchPuppeteer();

    const page = await browser.newPage();
    await Apify.utils.puppeteer.injectJQuery(page);

    console.log('Going to the website...');
    await page.goto(sourceUrl, { waitUntil: 'networkidle0', timeout: 600000 });

    console.log('Getting data...');

    const result = await page.evaluate(() => {
        const now = new Date();

        const activeCases = Number($('strong:contains(Active)').next().text().split("(")[0]);
        const recovered = Number($('strong:contains(Discharged)').next().text().split("(")[0]);
        const deaths = Number(Number($('strong:contains(Deaths)').next().text().split("(")[0]));

        const rawTableRows = [...document.querySelectorAll("#state-data > div > div > div > div > table > tbody > tr")];
        const regionsTableRows = rawTableRows.filter(row => row.querySelectorAll('td').length === 8);
        const regionData = [];

        console.log(regionsTableRows)

        for (const row of regionsTableRows) {
            const cells = Array.from(row.querySelectorAll("td")).map(td => td.textContent);
            if (cells[1] !== 'Total#') regionData.push({
                region: cells[1],
                totalInfected: Number(cells[2]),
                recovered: Number(cells[4]),
                deceased: Number(cells[6])
            });
        }

        const data = {
            activeCases: activeCases,
            recovered: recovered,
            deaths: deaths,
            totalCases: parseInt(activeCases) + parseInt(recovered) + parseInt(deaths),
            sourceUrl: 'https://www.mohfw.gov.in/',
            lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
            readMe: 'https://github.com/zpelechova/covid-in/blob/master/README.md',
            regionData: regionData
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
