const Apify = require('apify');

const sourceUrl = 'https://www.worldometers.info/coronavirus/?utm_campaign=homeAdvegas1?';
const LATEST = 'LATEST';

Apify.main(async () => {

    const kvStore = await Apify.openKeyValueStore('COVID-19-WM');
    const dataset = await Apify.openDataset('COVID-19-WM-HISTORY');

    console.log('Launching Puppeteer...');
    const browser = await Apify.launchPuppeteer();

    const page = await browser.newPage();
    await Apify.utils.puppeteer.injectJQuery(page);

    console.log('Going to the main website...');
    await page.goto(sourceUrl, { waitUntil: 'networkidle0', timeout: 60000 });

    console.log('Getting data...');
    const result = await page.evaluate(() => {

        const regionsTableRows = Array.from(document.querySelectorAll("#main_table_countries_today > tbody > tr"));
        const regionData = [];
        // replace ALL , in the string, not only first occurence of ,
        const toInt = (a) => Number(a.replace(/,/g, ''))

        for (const row of regionsTableRows) {
            const cells = Array.from(row.querySelectorAll("td")).map(td => td.textContent);
            regionData.push({ country: cells[1].trim(), totalCases: toInt(cells[2]), newCases: toInt(cells[3]), totalDeaths: toInt(cells[4]), newDeaths: toInt(cells[5]), totalRecovered: toInt(cells[6]), activeCases: toInt(cells[7]), seriousCritical: toInt(cells[8]), casesPerMil: toInt(cells[9]), deathsPerMil: toInt(cells[10]), totalTests: toInt(cells[11]), testsPerMil: toInt(cells[12]) });
        }

        const result = {
            regionData: regionData[0]
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
