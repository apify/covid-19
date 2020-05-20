const Apify = require('apify');

const sourceUrl = 'http://covid-19.moh.gov.my/';
const LATEST = 'LATEST';
let check = false;

Apify.main(async () => {

    // const kvStore = await Apify.openKeyValueStore('COVID-19-MY');
    // const dataset = await Apify.openDataset('COVID-19-MY-HISTORY');
    // const { email } = await Apify.getValue('INPUT');

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

        // const testedPositive = $('#container_content > div.editable > center:nth-child(10) > table > tbody > tr:nth-child(1) > td:nth-child(2) > span').text();
        // const testedNegative = $("#container_content > div.editable > center:nth-child(10) > table > tbody > tr:nth-child(2) > td:nth-child(2) > span").text();

        // const recovered = $("#container_content > div.editable > center:nth-child(11) > table > tbody > tr:nth-child(1) > td:nth-child(2) > span").text();
        // const inICU = $("#container_content > div.editable > center:nth-child(11) > table > tbody > tr:nth-child(2) > td:nth-child(2) > span").text();

        const iframeDocument = document.querySelector('#g-header .g-content > iframe').contentDocument;
        const testedPositive = iframeDocument.querySelector('.InfographicEditor-Contents-Item:nth-child(19) span[data-text=true]').innerText;
        const recovered = iframeDocument.querySelector('.InfographicEditor-Contents-Item:nth-child(17) span[data-text=true]').innerText;
        const activeCases = iframeDocument.querySelector('.InfographicEditor-Contents-Item:nth-child(21) span[data-text=true]').innerText;
        const inICU = iframeDocument.querySelector('.InfographicEditor-Contents-Item:nth-child(37) .__ig-alignCenter:nth-child(2) span[data-text=true]').innerText;
        const respiratoryAid = iframeDocument.querySelector('.InfographicEditor-Contents-Item:nth-child(38) .__ig-alignCenter:nth-child(2) span[data-text=true]').innerText;
        const deceased = iframeDocument.querySelector('.InfographicEditor-Contents-Item:nth-child(18) span[data-text=true]').innerText;

        const data = {
            // testedNegative: testedNegative,
            // testedTotal: Number(testedPositive) + Number(testedNegative),
            testedPositive: Number(testedPositive),
            recovered: Number(recovered),
            activeCases: Number(activeCases),
            inICU: Number(inICU),
            respiratoryAid: Number(respiratoryAid),
            deceased: Number(deceased),
            sourceUrl: 'http://covid-19.moh.gov.my/',
            lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
            readMe: 'https://github.com/zpelechova/covid-my/blob/master/README.md',
        };
        return data;

    });

    console.log(result)

    // if (!result.testedTotal || !result.deceased || !result.recovered) {
    //     check = true;
    // }
    // else {
    //     let latest = await kvStore.getValue(LATEST);
    //     if (!latest) {
    //         await kvStore.setValue('LATEST', result);
    //         latest = result;
    //     }
    //     delete latest.lastUpdatedAtApify;
    //     const actual = Object.assign({}, result);
    //     delete actual.lastUpdatedAtApify;

    //     if (JSON.stringify(latest) !== JSON.stringify(actual)) {
    //         await dataset.pushData(result);
    //     }

    //     await kvStore.setValue('LATEST', result);
    //     await Apify.pushData(result);
    // }


    // console.log('Closing Puppeteer...');
    // await browser.close();
    // console.log('Done.');

    // // if there are no data for TotalInfected, send email, because that means something is wrong
    // const env = await Apify.getEnv();
    // if (check) {
    //     await Apify.call(
    //         'apify/send-mail',
    //         {
    //             to: email,
    //             subject: `Covid-19 MY from ${env.startedAt} failed `,
    //             html: `Hi, ${'<br/>'}
    //                     <a href="https://my.apify.com/actors/${env.actorId}#/runs/${env.actorRunId}">this</a> 
    //                     run had 0 TotalInfected, check it out.`,
    //         },
    //         { waitSecs: 0 },
    //     );
    // };
});
