const Apify = require('apify');

const sourceUrl = 'https://www.worldometers.info/coronavirus/?utm_campaign=homeAdvegas1?';
const LATEST = 'LATEST';
let check = false;

Apify.main(async () => {

    const kvStore = await Apify.openKeyValueStore('COVID-19-WM');
    const dataset = await Apify.openDataset('COVID-19-WM-HISTORY');
    const { email } = await Apify.getValue('INPUT');

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
            regionData.push({ country: cells[0].trim(), totalCases: toInt(cells[1]), newCases: toInt(cells[2]), totalDeaths: toInt(cells[3]), newDeaths: toInt(cells[4]), totalRecovered: toInt(cells[5]), activeCases: toInt(cells[6]), seriousCritical: toInt(cells[7]), casesPerMil: toInt(cells[8]), deathsPerMil: toInt(cells[9]), totalTests: toInt(cells[10]), testsPerMil: toInt(cells[11]) });
        }

        const data = {
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

    // if there are no data for TotalInfected, send email, because that means something is wrong
    const env = await Apify.getEnv();
    if (check) {
        await Apify.call(
            'apify/send-mail',
            {
                to: email,
                subject: `Covid-19 WM from ${env.startedAt} failed `,
                html: `Hi, ${'<br/>'}
                        <a href="https://my.apify.com/actors/${env.actorId}#/runs/${env.actorRunId}">this</a> 
                        run had 0 TotalInfected, check it out.`,
            },
            { waitSecs: 0 },
        );
    };
});
