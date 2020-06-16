const Apify = require("apify");
const cheerio = require("cheerio");

const toNumber = (text => parseInt(text.replace(/\D/g, ''), 10))

const getDataFromIdnes = async () => {
    let infectedByBabisNewspapers;
    try {
        const response = await Apify.utils.requestAsBrowser({
            url: "https://www.idnes.cz/koronavirus",
            proxyUrl: Apify.getApifyProxyUrl({ groups: ["SHADER"] }),
            abortFunction: () => false,
        });
        const $ = await cheerio.load(response.body);
        const liList = $('.korkru-statistic').find('li');
        const totalInfected = toNumber($(liList).eq(0).find('b').text());
        const totalDeaths = toNumber($(liList).eq(3).find('td').eq(1).text());
        const totalCured = toNumber($(liList).eq(2).find('td').eq(1).text());
        const totalTested = toNumber($(liList).eq(1).find('b').text());

        infectedByBabisNewspapers = {
            totalInfected,
            totalDeaths,
            totalCured,
            totalTested,
        }
    } catch (e) {
        console.log("Could not get data from Idnes", e);
    }
    return infectedByBabisNewspapers;
};

module.exports = getDataFromIdnes;
