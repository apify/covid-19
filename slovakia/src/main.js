const Apify = require('apify');
const cheerio = require("cheerio");

const toNumber = (str) => {
    return parseInt(str.replace(",", ""))
};

const LATEST = "LATEST";

Apify.main(async () => {
    const url = "https://www.arcgis.com/apps/opsdashboard/index.html#/5fe83e34abc14349b7d2fcd5c48c6c85";
    const kvStore = await Apify.openKeyValueStore("COVID-19-SLOVAK-3");
    const dataset = await Apify.openDataset("COVID-19-SLOVAK-3-HISTORY");

    console.log('Launching Puppeteer...');
    const browser = await Apify.launchPuppeteer({
        headless: true,
        defaultViewport: {height: 1080, width: 1920},
        useChrome: true,
        useApifyProxy: false
    });

    console.log(`Getting data from ${url}...`);
    const page = await browser.newPage();
    await Apify.utils.puppeteer.injectJQuery(page);
    await page.goto(url, {waitUntil: "networkidle0", timeout: 60000});

    await page.waitFor(() => $("kpimetric:contains(Stav k)"));
    page.on("console", (log) => console.log(log.text()));
    await Apify.utils.sleep(10000);
    const extractedData = await page.evaluate(() => {
        const elementContains = (selector, pattern) => {
            const node = document.querySelectorAll(selector);
            if (node.length == 1) {
                if (node[0].textContent.includes(pattern)) {
                    return node[0];
                }
            } else if (node.length > 1) {
                let rightNode = null;
                node.forEach(function(value, index) {
                    if (value.textContent.includes(pattern)) {
                        rightNode = value;
                    }
                });
                return rightNode;
            }
        }

        let totalInfected = elementContains('.dock-element .caption span', 'Celkový počet pozitívnych vzoriek') !== null ? elementContains('.dock-element .caption span', 'Celkový počet pozitívnych vzoriek').closest('.dock-element').querySelector('.responsive-text-label text').textContent.replace(',', '') : null;
        let totalNegative = elementContains('.dock-element .caption span', 'Celkovo negatívne testy') !== null ? elementContains('.dock-element .caption span', 'Celkovo negatívne testy').closest('.dock-element').querySelector('.responsive-text-label text').textContent.replace(',', '') : null;
        let totalDeaths = elementContains('.dock-element .caption span', 'Celkový počet úmrtí') !== null ? elementContains('.dock-element .caption span', 'Celkový počet úmrtí').closest('.dock-element').querySelector('.responsive-text-label text').textContent.replace(',', '') : null;
        let totalCured = elementContains('.dock-element .caption span', 'Celkový počet vyliečených') !== null ? elementContains('.dock-element .caption span', 'Celkový počet vyliečených').closest('.dock-element').querySelector('.responsive-text-label text').textContent.replace(',', '') : null;

        /* Get data from graphs */
        let dataByDatesTemp = {};
        let dataByDates = new Array();

        // Graph of infected
        let graphInfectedNodes = new Array();
        let graphInfectedNodes2 = new Array();
        function getGraphInfected() {
            const graphLines = elementContains('.chart-widget .widget-header', 'Pozitívne vzorky') !== null ? elementContains('.chart-widget .widget-header', 'Pozitívne vzorky').closest('.chart-widget').querySelectorAll('.amcharts-graph-line') : null;
            graphLines.forEach(function(value, index) {
                if (value.querySelector('circle') && value.querySelector('circle').getAttribute('aria-label').startsWith('Celkový')) {
                    graphInfectedNodes = value.querySelectorAll('circle');
                }
                if (value.querySelector('circle') && value.querySelector('circle').getAttribute('aria-label').startsWith('Denný prírastok') || value.querySelector('circle') && value.querySelector('circle').getAttribute('aria-label').startsWith('Denný prirastok')) {
                    graphInfectedNodes2 = value.querySelectorAll('circle');
                }
            });
        }
        getGraphInfected();
        graphInfectedNodes.forEach(function(value, index) {
            const data = value.getAttribute('aria-label');
            let date = data.replace('Celkový', '').replace(/(, \d\d\d\d).*/g, '$1').trim() ? data.replace('Celkový', '').replace(/(, \d\d\d\d).*/g, '$1').trim() : 0;
            const infectedCount = data.replace(/.*, \d\d\d\d (.*)/g, '$1').trim().replace(',', '') ? data.replace(/.*, \d\d\d\d (.*)/g, '$1').trim().replace(',', '') : 0;

            date = new Date(Date.parse(date.replace(',', ''))).toISOString();

            if (!dataByDatesTemp[date]) {
                dataByDatesTemp[date] = {};
            }
            dataByDatesTemp[date]['infectedTotal'] = parseInt(infectedCount);
        });
        graphInfectedNodes2.forEach(function(value, index) {
            const data = value.getAttribute('aria-label');
            let date = data.replace('Denný prirastok', '').replace('Denný prírastok', '').replace(/(, \d\d\d\d).*/g, '$1').trim() ? data.replace('Denný prirastok', '').replace('Denný prírastok', '').replace(/(, \d\d\d\d).*/g, '$1').trim() : 0;
            const infectedCount = data.replace(/.*, \d\d\d\d (.*)/g, '$1').trim().replace(',', '') ? data.replace(/.*, \d\d\d\d (.*)/g, '$1').trim().replace(',', '') : 0;

            date = new Date(Date.parse(date.replace(',', ''))).toISOString();

            if (!dataByDatesTemp[date]) {
                dataByDatesTemp[date] = {};
            }
            dataByDatesTemp[date]['infectedNew'] = parseInt(infectedCount);
        });

        // Graph of negative
        let graphNegativeNodes = new Array();
        let graphNegativeNodes2 = new Array();
        function getGraphNegative() {
            const graphLines = elementContains('.chart-widget .widget-header', 'Negatívne vzorky') !== null ? elementContains('.chart-widget .widget-header', 'Negatívne vzorky').closest('.chart-widget').querySelectorAll('.amcharts-graph-line') : null;
            graphLines.forEach(function(value, index) {
                if (value.querySelector('circle') && value.querySelector('circle').getAttribute('aria-label').startsWith('Celkový')) {
                    graphNegativeNodes = value.querySelectorAll('circle');
                }
                if (value.querySelector('circle') && value.querySelector('circle').getAttribute('aria-label').startsWith('Denný prírastok') || value.querySelector('circle') && value.querySelector('circle').getAttribute('aria-label').startsWith('Denný prirastok')) {
                    graphNegativeNodes2 = value.querySelectorAll('circle');
                }
            });
        }
        getGraphNegative();
        graphNegativeNodes.forEach(function(value, index) {
            const data = value.getAttribute('aria-label');
            let date = data.replace('Celkový', '').replace(/(, \d\d\d\d).*/g, '$1').trim() ? data.replace('Celkový', '').replace(/(, \d\d\d\d).*/g, '$1').trim() : 0;
            const negativeCount = data.replace(/.*, \d\d\d\d (.*)/g, '$1').trim().replace(',', '') ? data.replace(/.*, \d\d\d\d (.*)/g, '$1').trim().replace(',', '') : 0;

            date = new Date(Date.parse(date.replace(',', ''))).toISOString();

            if (!dataByDatesTemp[date]) {
                dataByDatesTemp[date] = {};
            }
            dataByDatesTemp[date]['negativeTotal'] = parseInt(negativeCount);

            if(index == (graphNegativeNodes.length - 1)) {
                if(totalNegative == null) {
                    totalNegative = parseInt(negativeCount);
                }
            }
        });
        graphNegativeNodes2.forEach(function(value, index) {
            const data = value.getAttribute('aria-label');
            let date = data.replace('Denný prirastok', '').replace('Denný prírastok', '').replace(/(, \d\d\d\d).*/g, '$1').trim() ? data.replace('Denný prirastok', '').replace('Denný prírastok', '').replace(/(, \d\d\d\d).*/g, '$1').trim() : 0;
            const negativeCount = data.replace(/.*, \d\d\d\d (.*)/g, '$1').trim().replace(',', '') ? data.replace(/.*, \d\d\d\d (.*)/g, '$1').trim().replace(',', '') : 0;

            date = new Date(Date.parse(date.replace(',', ''))).toISOString();

            if (!dataByDatesTemp[date]) {
                dataByDatesTemp[date] = {};
            }
            dataByDatesTemp[date]['negativeNew'] = parseInt(negativeCount);
        });

        Object.entries(dataByDatesTemp).forEach(function(value, index) {
            dataByDates.push({
                'date': value[0],
                "infected": parseInt(value[1]['infectedTotal']),
                "infectedNew": parseInt(value[1]['infectedNew']),
                "negative": parseInt(value[1]['negativeTotal']),
                "negativeNew": parseInt(value[1]['negativeNew'])
            });
        });
        /* Get data from graphs end */

        /* Get data by regions */
        let dataByRegions = {};

        // Get data by county
        if (!dataByRegions['county']) {
            dataByRegions['county'] = new Array;
        }

        let regionsNodes = new Array();
        function getRegionsFromTable() {
            const regionsItems = elementContains('.list-widget .widget-header', 'Stav podľa okresov') !== null ? elementContains('.list-widget .widget-header', 'Stav podľa okresov').closest('.list-widget').querySelectorAll('.feature-list-item') : null;
            regionsItems.forEach(function(value, index) {
                if (value.querySelector('.external-html span')) {
                    regionsNodes.push(value.querySelector('.external-html span'));
                }
            });
        }
        getRegionsFromTable();
        regionsNodes.forEach(function(value, index) {
            const regionData = value.innerHTML;
            const region = regionData.replace(/(?:&nbsp;)+<.*/g, '').replace('Okresy ', '').trim();
            const infected = regionData.replace(/.*(?:e60000">)/g, '').replace(/(?:&nbsp;)<\/.*/g, '').trim();
            const infectedNew = regionData.replace(/.*(?:00a9e6">&nbsp;)/g, '').replace(/<\/span><\/s.*/g, '').trim();
            dataByRegions['county'].push({
                'name': region,
                'infected': parseInt(infected),
                'infectedNew': parseInt(infectedNew)
            });
        });

        // Get data by region
        const regions = [
            'Bratislavský',
            'Trnavský',
            'Trenčínský',
            'Nitranský',
            'Žilinský',
            'Banskobystrický',
            'Prešovský',
            'Košický',
            '?'
        ];

        if (!dataByRegions['region']) {
            dataByRegions['region'] = new Array();
        }

        let regionsData = {};

        regionsNodes.forEach(function(value, index) {
            const regionData = value.innerHTML;
            const region = regionData.replace(/(?:&nbsp;)+<.*/g, '').replace('Okresy ', '').trim();
            const infected = regionData.replace(/.*(?:e60000">)/g, '').replace(/(?:&nbsp;)<\/.*/g, '').trim();
            const infectedNew = regionData.replace(/.*(?:00a9e6">&nbsp;)/g, '').replace(/<\/span><\/s.*/g, '').trim();

            const regionsByCounty = {
                'Bratislavský': [
                    'Bratislava',
                    'Bratislava I',
                    'Bratislava II',
                    'Bratislava III',
                    'Bratislava IV',
                    'Bratislava V',
                    'Malacky',
                    'Pezinok',
                    'Senec'
                ],
                'Trnavský': [
                    'Dunajská Streda',
                    'Galanta',
                    'Hlohovec',
                    'Piešťany',
                    'Senica',
                    'Skalica',
                    'Trnava'
                ],
                'Trenčínský': [
                    'Bánovce nad Bebravou',
                    'Ilava',
                    'Myjava',
                    'Nové Mesto nad Váhom',
                    'Partizánske',
                    'Považská Bystrica',
                    'Prievidza',
                    'Púchov',
                    'Trenčín'
                ],
                'Nitranský': [
                    'Komárno',
                    'Levice',
                    'Nitra',
                    'Nové Zámky',
                    'Šaľa',
                    'Topoľčany',
                    'Zlaté Moravce'
                ],
                'Žilinský': [
                    'Bytča',
                    'Čadca',
                    'Dolný Kubín',
                    'Kysucké Nové Mesto',
                    'Liptovský Mikuláš',
                    'Martin',
                    'Námestovo',
                    'Ružomberok',
                    'Turčianske Teplice',
                    'Tvrdošín',
                    'Žilina'
                ],
                'Banskobystrický': [
                    'Banská Bystrica',
                    'Banská Štiavnica',
                    'Brezno',
                    'Detva',
                    'Krupina',
                    'Lučenec',
                    'Poltár',
                    'Revúca',
                    'Rimavská Sobota',
                    'Veľký Krtíš',
                    'Zvolen',
                    'Žarnovica',
                    'Žiar nad Hronom'
                ],
                'Prešovský': [
                    'Bardejov',
                    'Humenné',
                    'Kežmarok',
                    'Levoča',
                    'Medzilaborce',
                    'Poprad',
                    'Prešov',
                    'Sabinov',
                    'Snina',
                    'Stará Ľubovňa',
                    'Stropkov',
                    'Svidník',
                    'Vranov nad Topľou'
                ],
                'Košický': [
                    'Gelnica',
                    'Košice',
                    'Košice I',
                    'Košice II',
                    'Košice III',
                    'Košice IV',
                    'Košice–okolí',
                    'Košice–okolie',
                    'Košice - okolie',
                    'Michalovce',
                    'Rožňava',
                    'Sobrance',
                    'Spišská Nová Ves',
                    'Trebišov'
                ],
                '?': [
                    '?',
                    'neuvedený'
                ]
            }

            let resRegion = '???';

            for (const [key, value] of Object.entries(regionsByCounty)) {
                if (value.includes(region)) {
                    resRegion = key;
                }
            };

            if (resRegion == '???') {
                console.error('error region: ' + region);
            }

            if (!regionsData[resRegion]) {
                regionsData[resRegion] = {};
            }

            if (!regionsData[resRegion]['infected']) {
                regionsData[resRegion]['infected'] = parseInt(infected);
            } else {
                regionsData[resRegion]['infected'] = regionsData[resRegion]['infected'] + parseInt(infected);
            }

            if (!regionsData[resRegion]['infectedNew']) {
                regionsData[resRegion]['infectedNew'] = parseInt(infectedNew);
            } else {
                regionsData[resRegion]['infectedNew'] = regionsData[resRegion]['infectedNew'] + parseInt(infectedNew);
            }
        });

        Object.entries(regionsData).forEach(function(value, index) {
            dataByRegions['region'].push({
                'name': value[0],
                'infected': parseInt(value[1]['infected']),
                'infectedNew': parseInt(value[1]['infectedNew'])
            });
        });
        /* Get data by regions end */

        const lastUpdated = elementContains('.external-html h3 span span', 'Stav k').textContent.replace('Stav k', '').trim().replace(/\. /g, '.');

        return {
            lastUpdated: lastUpdated,
            totalInfected: totalInfected,
            totalNegative: totalNegative,
            totalDeaths: totalDeaths,
            totalCured: totalCured,
            dataByDates: dataByDates,
            dataByRegions: dataByRegions
        }
    });

    const lastUpdated = extractedData.lastUpdated;
    const parts = lastUpdated.split(" ");
    const splited = parts[0].split(".");
    let lastUpdatedParsed = new Date();
    if (parts.length > 1) {
        lastUpdatedParsed = new Date(`${splited[1]}.${splited[0]}.${splited[2]} ${parts[1]}`);
    } else if (parts.length == 1) {
        lastUpdatedParsed = new Date(`${splited[1]}.${splited[0]}.${splited[2]}`);
    }
    lastUpdatedParsed = new Date(Date.UTC(lastUpdatedParsed.getFullYear(), lastUpdatedParsed.getMonth(), lastUpdatedParsed.getDate(), lastUpdatedParsed.getHours() - 1, lastUpdatedParsed.getMinutes()));

    console.log(`Processing and saving data.`);

    const now = new Date();

    const data = {
        dataByDates: extractedData.dataByDates,
        dataByRegions: extractedData.dataByRegions,
        infected: parseInt(extractedData.totalInfected),
        negative: parseInt(extractedData.totalNegative),
        tested: parseInt(extractedData.totalInfected) + parseInt(extractedData.totalNegative),
        recovered: parseInt(extractedData.totalCured),
        deceased: parseInt(extractedData.totalDeaths),
        country: "Slovakia",
        historyData: "https://api.apify.com/v2/datasets/oUWi8ci7F2R9V5ZFy/items?format=json&clean=1",
        sourceUrl: url,
        lastUpdatedAtSource: lastUpdatedParsed.toISOString(),
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
        readMe: "https://apify.com/davidrychly/covid-sk-3",
    };

    // Compare and save to history
    const latest = await kvStore.getValue(LATEST);
    if (latest && latest.lastUpdatedAtApify) {
        delete latest.lastUpdatedAtApify;
    }
    const actual = Object.assign({}, data);
    delete actual.lastUpdatedAtApify;

    if (JSON.stringify(latest) !== JSON.stringify(actual)) {
        await dataset.pushData(data);
    }

    await kvStore.setValue(LATEST, data);
    await Apify.pushData(data);

    console.log('Done.');
});