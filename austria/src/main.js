const Apify = require('apify');
const extractNumbers = require('extract-numbers');

const LATEST = 'LATEST';
const parseNum = (str) => {
    return parseInt(extractNumbers(str)[0].replace('.', ''), 10);
};

Apify.main(async () => {
    const url = 'https://www.sozialministerium.at/Informationen-zum-Coronavirus/Neuartiges-Coronavirus-(2019-nCov).html';
    const kvStore = await Apify.openKeyValueStore('COVID-19-AUSTRIA');
    const dataset = await Apify.openDataset('COVID-19-AUSTRIA-HISTORY');

    const browser = await Apify.launchPuppeteer({ useApifyProxy: true, apifyProxyGroups: ['SHADER'] });
    const page = await browser.newPage();
    await Apify.utils.puppeteer.injectJQuery(page);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    const extracted = await page.evaluate(() => {
        const getNameAndValue = (str) => {
            const split = str.split(' (');
            return { name: split[0].trim(), value: parseInt(split[1].replace(')', '').trim(), 10) };
        };
        const processInfoString = (str) => {
            const split = str.split(',');
            split.splice(0, 3);
            const info = [];
            split.forEach((region) => {
                const regionString = region.replace('nach Bundesländern:', '').trim();
                if (regionString.includes('und')) {
                    const [first, second] = regionString.split('und');
                    info.push(getNameAndValue(first));
                    info.push(getNameAndValue(second));
                } else {
                    info.push(getNameAndValue(regionString));
                }
            });
            return info;
        };

        const totalTested = $('p:contains(Bisher durchgeführte Testungen)').text();
        console.log(totalTested, 'TESTED');
        const splitDate = date.split('.');
        const dummyDate = new Date(`${splitDate[1]}/${splitDate[0]}/${splitDate[2]} ${hours.trim().slice(0, 4)}`);
        const lastUpdated = new Date(Date.UTC(dummyDate.getFullYear(), dummyDate.getMonth(), dummyDate.getDate(), dummyDate.getHours()));

        const infectedByRegionString = $('p:contains(Bestätigte Fälle,)').text();
        const infectedByRegion = processInfoString(infectedByRegionString);


        const curedByRegionString = $('p:contains(Genesene Personen,)').text();
        const curedByRegion = processInfoString(curedByRegionString);

        // TODO: Fix after there are more examples :(
        const deathByRegionString = $('p:contains(Todesfälle,)').text();
        const deathByRegion = processInfoString(deathByRegionString);


        return {
            totalTested,
            totalInfected,
            totalCured,
            totalDeaths,
            lastUpdated: lastUpdated.toISOString(),
            infectedByRegion,
            curedByRegion,
            deathByRegion,
        };
    });


    const now = new Date();
    const data = {
        totalTested: parseNum(extracted.totalTested),
        totalCases: parseNum(extracted.totalInfected),
        totalDeaths: parseNum(extracted.totalDeaths),
        infectedByRegion: extracted.infectedByRegion,
        curedByRegion: extracted.curedByRegion,
        deathByRegion: extracted.deathByRegion,
        sourceUrl: url,
        lastUpdatedAtSource: extracted.lastUpdated,
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
        readMe: 'https://apify.com/petrpatek/covid-austria',
    };


    let latest = await kvStore.getValue(LATEST);
    if (!latest) {
        await kvStore.setValue('LATEST', data);
        latest = data;
    }
    delete latest.lastUpdatedAtApify;
    const actual = Object.assign({}, data);
    delete actual.lastUpdatedAtApify;

    if (JSON.stringify(latest) !== JSON.stringify(actual)) {
        await dataset.pushData(data);
    }

    await kvStore.setValue('LATEST', data);
    await Apify.pushData(data);


    console.log('Closing Puppeteer...');
    await browser.close();
    console.log('Done.');
});
