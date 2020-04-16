const Apify = require('apify');

const sourceUrl = 'http://www.moh.gov.my/index.php/pages/view/2019-ncov-wuhan';
const LATEST = 'LATEST';
let check = false;

Apify.main(async () => {

    const kvStore = await Apify.openKeyValueStore('COVID-19-MY');
    const dataset = await Apify.openDataset('COVID-19-MY-HISTORY');
    const { email } = await Apify.getValue('INPUT');

    console.log('Launching Puppeteer...');
    const browser = await Apify.launchPuppeteer();

    const page = await browser.newPage();
    await Apify.utils.puppeteer.injectJQuery(page);

    console.log('Going to the website...');
    await page.goto(sourceUrl), { waitUntil: 'networkidle0', timeout: 60000 };

    console.log('Getting data...');

    const result = await page.evaluate(() => {
        const now = new Date();

        const testedPositive = $('#container_content > div.editable > center:nth-child(10) > table > tbody > tr:nth-child(1) > td:nth-child(2) > span').text();
        const testedNegative = $("#container_content > div.editable > center:nth-child(10) > table > tbody > tr:nth-child(2) > td:nth-child(2) > span").text();

        const recovered = $("#container_content > div.editable > center:nth-child(11) > table > tbody > tr:nth-child(1) > td:nth-child(2) > span").text();
        const inICU = $("#container_content > div.editable > center:nth-child(11) > table > tbody > tr:nth-child(2) > td:nth-child(2) > span").text();
        const deceased = $("#container_content > div.editable > center:nth-child(11) > table > tbody > tr:nth-child(3) > td:nth-child(2) > span").text();

        const data = {
            testedPositive: testedPositive,
            testedNegative: testedNegative,
            testedTotal: Number(testedPositive) + Number(testedNegative),
            recovered: recovered,
            inICU: inICU,
            deceased: deceased,
            sourceUrl: 'http://www.moh.gov.my/index.php/pages/view/2019-ncov-wuhan',
            lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
            readMe: 'https://github.com/zpelechova/covid-my/blob/master/README.md',
        };
        return data;

    });

    console.log(result)

    if (!result.testedTotal || !result.deceased || !result.recovered) {
        check = true;
    }
    else {
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
    }


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
                subject: `Covid-19 MY from ${env.startedAt} failed `,
                html: `Hi, ${'<br/>'}
                        <a href="https://my.apify.com/actors/${env.actorId}#/runs/${env.actorRunId}">this</a> 
                        run had 0 TotalInfected, check it out.`,
            },
            { waitSecs: 0 },
        );
    };
});
