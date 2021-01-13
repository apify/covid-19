const Apify = require('apify');
const cheerio = require("cheerio");
let decodeHtml = require("decode-html")
const getDataFromIdnes = require("./idnes");
const toNumber = (str) => {
    return parseInt(str.replace(/\D+/g, ""), 10)
};

const parseDateToUTC = (dateString) => {
    const split = dateString.split(".");
    const date = new Date(`${split[1]}/${split[0]}/${split[2]}`)
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
};

const connectDataFromGraph = (graphData) => {

    return graphData.values.map((value) => ({
        value: value.y,
        date: parseDateToUTC(value.x).toISOString()
    }));
};
const getRegionData = async () => {
    const url = "https://onemocneni-aktualne.mzcr.cz/covid-19/prehledy-khs"
    const response = await Apify.utils.requestAsBrowser({
        url,
        proxyUrl: Apify.getApifyProxyUrl({ groups: ["SHADER"] }
        )
    });
    const $ = await cheerio.load(response.body);

    const sexAgeData = JSON.parse($("#js-total-sex-age-data").attr("data-barchart"));
    const recoveredByRegionData = JSON.parse(decodeHtml($('#js-total-region-recovered-data').attr('data-barchart')));
    const deathsByRegionData = JSON.parse(decodeHtml($('#js-total-region-died-data').attr('data-barchart')));

    return { sexAgeData, recoveredByRegionData, deathsByRegionData }
}

const getCummulativeData = async () => {
    const url = "https://onemocneni-aktualne.mzcr.cz/covid-19/kumulativni-prehledy"
    const response = await Apify.utils.requestAsBrowser({
        url,
        proxyUrl: Apify.getApifyProxyUrl({ groups: ["SHADER"] }
        )
    });
    const $ = await cheerio.load(response.body);
    const infectedData = JSON.parse($("#js-cummulative-total-persons-data").attr("data-linechart"));
    const numberOfTestedData = JSON.parse($("#js-cumulative-total-tests-data").attr("data-linechart"))[0];
    return { infectedData, numberOfTestedData }
}

const getHospitalizationData = async () => {
    const url = "https://onemocneni-aktualne.mzcr.cz/covid-19/prehled-hospitalizaci"
    const response = await Apify.utils.requestAsBrowser({
        url,
        proxyUrl: Apify.getApifyProxyUrl({ groups: ["SHADER"] }
        )
    });
    const $ = await cheerio.load(response.body);

    const hospitalizationTable = JSON.parse($("#js-hospitalization-table-data").attr("data-table"));


    let hospitalizationTableData = [];
    hospitalizationTableData.push(hospitalizationTable.header.map(h => h.title));
    hospitalizationTableData = hospitalizationTableData.concat(hospitalizationTable.body.map(row => {
        const split = row[0].split(".");
        let reportDate = new Date(`${split[1]}.${split[0]}.${split[2]}`);
        reportDate = new Date(Date.UTC(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate()));

        row[0] = reportDate.toISOString();
        return row;
    }));
    return hospitalizationTableData
}
const LATEST = "LATEST";
// @TODO: Rewrite to crawler.

Apify.main(async () => {

    const kvStore = await Apify.openKeyValueStore("COVID-19-CZECH");
    const dataset = await Apify.openDataset("COVID-19-CZECH-HISTORY");

    const response = await Apify.utils.requestAsBrowser({
        url: "https://onemocneni-aktualne.mzcr.cz/covid-19",
        proxyUrl: Apify.getApifyProxyUrl({ groups: ["SHADER"] }
        )
    });
    const $ = await cheerio.load(response.body);
    const url = $("#covid-content").attr("data-report-url");
    const totalTested = $("#count-test").first().text().trim();
    const infected = $("#count-sick").attr("data-value").trim();
    const recovered = $("#count-recover").text().trim();
    const deceased = $("#count-dead").text().trim();
    const hospitalized = $("#count-hospitalization").text().trim();
    const active = $("#count-active").text().trim();
    const infectedDailyData = JSON.parse($("#js-total-persons-data").attr("data-linechart"));
    const infectedByRegionData = JSON.parse(decodeHtml($('#panel2-districts-regions-maps div[data-barchart]').attr('data-barchart')));

    const { recoveredByRegionData, deathsByRegionData, sexAgeData } = await getRegionData();
    const { infectedData, numberOfTestedData } = await getCummulativeData();
    const hospitalizationTableData = await getHospitalizationData();


    const lastUpdated = $("#last-modified-datetime").text().trim().replace("k datu:", "").replace(/\u00a0/g, "");
    const parts = lastUpdated.split("v");
    const splited = parts[0].split(".");
    let lastUpdatedParsed = new Date(`${splited[1]}.${splited[0]}.${splited[2]} ${parts[1].replace("h", "").replace(".", ":")}`);
    lastUpdatedParsed = new Date(Date.UTC(lastUpdatedParsed.getFullYear(), lastUpdatedParsed.getMonth(), lastUpdatedParsed.getDate(), lastUpdatedParsed.getHours() - 1, lastUpdatedParsed.getMinutes()));

    const critical = hospitalizationTableData[hospitalizationTableData.length - 1][2];

    const now = new Date();
    const data = {
        totalTested: toNumber(totalTested),
        infected: toNumber(infected),
        recovered: toNumber(recovered),
        deceased: toNumber(deceased),
        hospitalized: toNumber(hospitalized),
        active: toNumber(active),
        critical,
        totalPositiveTests: connectDataFromGraph(infectedData),
        numberOfTestedGraph: connectDataFromGraph(numberOfTestedData),
        infectedByRegion: infectedByRegionData.values.map(({ x, y }) => ({ name: x, value: y })),
        recoveredByRegion: recoveredByRegionData.values.map(({ x, y }) => ({ name: x, value: y })),
        deceasedByRegion: deathsByRegionData.values.map(({ x, y }) => ({ name: x, value: y })),
        infectedDaily: connectDataFromGraph(infectedDailyData),
        infectedByAgeSex: sexAgeData.map((sexData) => ({
            sex: sexData.key,
            infectedByAge: sexData.values.map(({ x, y }) => ({
                age: x,
                value: y,
            })),
        })),
        sourceUrl: url,
        hospitalizationData: hospitalizationTableData,
        lastUpdatedAtSource: lastUpdatedParsed.toISOString(),
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
        readMe: "https://apify.com/petrpatek/covid-cz",
    };



    // Compare and save to history
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
    console.log('Done.');
});
