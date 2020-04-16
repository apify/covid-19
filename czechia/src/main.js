const Apify = require('apify');
const cheerio = require("cheerio");
const getDataFromIdnes = require("./idnes");
const toNumber = (str) => {
    return parseInt(str.replace(",", "").replace(" ", ""), 10)
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

const LATEST = "LATEST";

Apify.main(async () => {
    const kvStore = await Apify.openKeyValueStore("COVID-19-CZECH");
    const dataset = await Apify.openDataset("COVID-19-CZECH-HISTORY");

    const response = await Apify.utils.requestAsBrowser({
        url: "https://onemocneni-aktualne.mzcr.cz/covid-19",
        proxyUrl: Apify.getApifyProxyUrl({groups: ["SHADER"]}
        )
    });
    const $ = await cheerio.load(response.body);
    const url = $("#covid-content").attr("data-report-url");
    const totalTested = $("#count-test").text().trim();
    const infected = $("p#count-sick").eq(0).text().trim();
    const recovered = $("#count-recover").text().trim();
    const deceased = $("#count-dead").text().trim();
    const hospitalized = $("#count-hospitalization").text().trim();
    const active = $("#count-active").text().trim();
    const infectedData = JSON.parse($("#js-cummulative-total-persons-data").attr("data-linechart"));
    const numberOfTestedData = JSON.parse($("#js-cummulative-total-tests-data").attr("data-linechart"));
    const infectedByRegionData = JSON.parse($("#js-total-isin-regions-data").attr("data-barchart"));
    const deathsByRegionData = JSON.parse($("#js-total-region-died-data").attr("data-barchart"));
    const infectedDailyData = JSON.parse($("#js-total-persons-data").attr("data-barchart"));
    const regionQuarantineData = JSON.parse($("#js-region-quarantine-data").attr("data-barchart") || "[]");
    const regionQuarantine = regionQuarantineData.map(val => ({
        reportDate: parseDateToUTC(val.key.replace("Hlášení k ", "")).toISOString(),
        regionData: val.values.map(({x, y}) => ({regionName: x, value: y}))
    }));
    const sourceOfInfectionData = JSON.parse($("#js-total-foreign-countries-data").attr("data-barchart"));
    const sexAgeData = JSON.parse($("#js-total-sex-age-data").attr("data-barchart"));
    const protectionSuppliesSummaryTable = $(".static-table__container table");
    const hospitalizationTable = $(".static-table__container table.equipmentTable").eq(0);

    // Table with supplies
    const headers = [];
    const hospitalizationTableData = [];
    $(hospitalizationTable).find("thead th").each((idex, element) => {
        headers.push($(element).text().trim())
    });
    hospitalizationTableData.push(headers);

    $(hospitalizationTable).find("tbody tr").each((index, element) => {
        const rowData = [];
        $(element).find("td").each((i, el) => {
            const text = $(el).text().trim();
            if (i >= 1) {
                rowData.push(text.includes("%") ? text : toNumber(text));
            } else {
                const split = text.split(".");
                let reportDate = new Date(`${split[1]}.${split[0]}.${split[2]}`);
                reportDate = new Date(Date.UTC(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate()));

                rowData.push(reportDate.toISOString());
            }
        });
        hospitalizationTableData.push(rowData);
    });

    const lastUpdated = $("#last-modified-datetime").text().trim().replace("k", "").replace(/\u00a0/g, "");
    const parts = lastUpdated.split("v");
    const splited = parts[0].split(".");
    let lastUpdatedParsed = new Date(`${splited[1]}.${splited[0]}.${splited[2]} ${parts[1].replace("h", "").replace(".", ":")}`);
    lastUpdatedParsed = new Date(Date.UTC(lastUpdatedParsed.getFullYear(), lastUpdatedParsed.getMonth(), lastUpdatedParsed.getDate(), lastUpdatedParsed.getHours() - 1, lastUpdatedParsed.getMinutes()));

    const critical = hospitalizationTableData[1][2];
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
        infectedByRegion: infectedByRegionData.values.map(({x, y}) => ({name: x, value: y})),
        deceasedByRegion: deathsByRegionData.values.map(({x, y}) => ({name: x, value: y})),
        infectedDaily: connectDataFromGraph(infectedDailyData),
        regionQuarantine,
        countryOfInfection: sourceOfInfectionData.values.map((value) => ({countryName: value.x, value: value.y})),
        infectedByAgeSex: sexAgeData.map((sexData) => ({
            sex: sexData.key,
            infectedByAge: sexData.values.map(({x, y}) => ({
                age: x,
                value: y,
            })),
        })),
        // protectionSuppliesSummary: tableData,
        sourceUrl: url,
        hospitalizationData: hospitalizationTableData,
        lastUpdatedAtSource: lastUpdatedParsed.toISOString(),
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
        readMe: "https://apify.com/petrpatek/covid-cz",
    };

    // Data from idnes - They have newer numbers than MZCR...
    const idnesData = await getDataFromIdnes();
    data.fromBabisNewspapers = {
        ...idnesData
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
