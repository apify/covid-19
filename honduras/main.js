const Apify = require('apify');
const httpRequest = require('@apify/http-request');
const cheerio = require('cheerio');
const LATEST = 'LATEST';

Apify.main(async () => {

    const kvStore = await Apify.openKeyValueStore('COVID-19-HN');
    const dataset = await Apify.openDataset('COVID-19-HN-HISTORY');

    const { body: sex } = await httpRequest({
        url: "https://covid19honduras.org/dll/OTOTALSEXO.php",
        json: true,
        ignoreSslErrors: true,
    });

    const sexes = sex.map(sex => {

        if (sex.sexo === "Mujeres") {
            return { women: Number(sex.cant) }
        }
        if (sex.sexo === "Hombres") {
            return { men: Number(sex.cant) }
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
            infected: Number(region.value),
            deceased: Number(region.muertos),
            recovered: Number(region.recu)
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
            totalInfected: Number(date.cantidad)
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
            dailyInfected: Number(date.cantidad)
        }
    });

    const { body: general } = await httpRequest({ url: "http://www.salud.gob.hn/site/" });
    const $ = cheerio.load(general);

    const infected = $('.skillbar:contains(Confirmados)').prev().text().trim().replace(/\D/g, '');
    const recovered = $('.skillbar:contains(Recuperados)').prev().text().trim().replace(/\D/g, '');
    const deceased = $('.skillbar:contains(Fallecidos)').prev().text().trim().replace(/\D/g, '');

    // const dateString = $('#art-main > div > div.art-layout-wrapper > div > div > div.art-layout-cell.art-content > div:nth-child(4) > div > div > section > div > div > div:nth-child(1) > div > p').text();
    // const cleanDateString = dateString.replace('Actualizado el', '').trim();
    // const [day, month, year] = cleanDateString.split(' de ');
    // const months = {
    //     enero: 0,
    //     febrero: 1,
    //     marzo: 2,
    //     abril: 3,
    //     mayo: 4,
    //     junio: 5,
    //     julio: 6,
    //     agosto: 7,
    //     septiembre: 8,
    //     octubre: 9,
    //     noviembre: 10,
    //     diciembre: 11,
    // }
    // const date = new Date(Date.UTC(year, months[month], day)).toISOString();

    
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
        // // lastUpdatedAtSource: date,
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


