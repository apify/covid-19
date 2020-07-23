const Apify = require('apify');
const httpRequest = require('@apify/http-request');
const cheerio = require('cheerio');
const LATEST = 'LATEST';

Apify.main(async () => {

    const kvStore = await Apify.openKeyValueStore('COVID-19-HONDURAS');
    const dataset = await Apify.openDataset('COVID-19-HONDURAS-HISTORY');

    const { body: sex } = await httpRequest({
        url: "https://covid19honduras.org/dll/OTOTALSEXO.php",
        json: true,
        ignoreSslErrors: true,
    });

    const sexes = sex.map(sex => {
        return {
            sex: sex.sexo,
            total: sex.cant,
        }
    })

    const { body: regions } = await httpRequest({
        url: "https://covid19honduras.org/dll/OMUERTOS_DEPTO.php",
        json: true,
        ignoreSslErrors: true,
    });

    const regionData = regions.map(region => {
        return {
            region: region.name,
            infected: region.value,
            deceased: region.muertos,
            recovered: region.recu
        }
    });

    const { body: history } = await httpRequest({
        url: "https://covid19honduras.org/dll/OGRAPHLINE2.php",
        json: true,
        ignoreSslErrors: true,
    });

    const historyData = history.map(date => {
        return {
            date: date.fecha,
            totalInfected: date.cantidad
        }
    });

    const { body: daily } = await httpRequest({
        url: "https://covid19honduras.org/dll/OGRAPHLINE.php",
        json: true,
        ignoreSslErrors: true,
    });

    const dailyData = daily.map(date => {
        return {
            date: date.fecha,
            dailyInfected: date.cantidad
        }
    });

    const { body: general } = await httpRequest({ url: "http://www.salud.gob.hn/site/" });
    const $ = cheerio.load(general);

    const infected = $('#art-main > div > div.art-layout-wrapper > div > div > div.art-layout-cell.art-content > div:nth-child(4) > div > div > section > div > div > div:nth-child(2) > div:nth-child(1) > div.skillbar-score > span.score').text().replace(",", "");
    const recovered = $('#art-main > div > div.art-layout-wrapper > div > div > div.art-layout-cell.art-content > div:nth-child(4) > div > div > section > div > div > div:nth-child(2) > div:nth-child(2) > div.skillbar-score > span.score').text().replace(",", "");
    const deceased = $('#art-main > div > div.art-layout-wrapper > div > div > div.art-layout-cell.art-content > div:nth-child(4) > div > div > section > div > div > div:nth-child(2) > div:nth-child(3) > div.skillbar-score').text().replace(",", "").trim();

    const now = new Date();

    const result = {
        country: "Honduras",
        infected: Number(infected),
        recovered: Number(recovered),
        deceased: Number(deceased),
        regionData,
        sexes,
        historyData,
        dailyData,
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
        readMe: 'https://apify.com/zuzka/honduras'
    }

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
});


