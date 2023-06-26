import maplibregl, { Map, RasterSourceSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Pool, fromUrl } from 'geotiff';
import { encode } from 'fast-png';

function getTargetDate(): Date {
    // 9時半を堺に対象の日付が変わる
    // 9時半前なら前々日
    // 9時半後なら前日
    const now = new Date();
    now.setHours(now.getHours() - 9);
    now.setMinutes(now.getMinutes() - 30);
    now.setDate(now.getDate() - 1);

    return now;
}
const targetDate = getTargetDate();
// console.log('targetDate', targetDate);

function formatTargetDate(targetDate: Date): string {
    const y = targetDate.getFullYear();
    const m = ('00' + (targetDate.getMonth()+1)).slice(-2);
    const d = ('00' + targetDate.getDate()).slice(-2);
    const ret = y + '' + m + '' + d;
    return ret;
}
const targetDateFormatted = formatTargetDate(targetDate);
// console.log('targetDateFormatted', targetDateFormatted);

function getVizDate(targetDate: Date): string {
    targetDate.setDate(targetDate.getDate() + 1);
    const y = targetDate.getFullYear();
    const m = ('00' + (targetDate.getMonth()+1)).slice(-2);
    const d = ('00' + targetDate.getDate()).slice(-2);
    const ret = y + '/' + m + '/' + d;
    return ret;
}
const vizDate = getVizDate(targetDate);
// console.log('vizDate', vizDate);

const headerTitle = document.getElementById('header-title') as HTMLElement;
headerTitle.innerHTML = `${vizDate}&nbsp;3時の予報`;

/**
 * transform x/y/z to webmercator-bbox
 * @param x
 * @param y
 * @param z
 * @returns {number[]} [minx, miny, maxx, maxy]
 */
function merc(x: number, y: number, z: number): number[] {
    // 参考: https://qiita.com/MALORGIS/items/1a9114dd090e5b891bf7
    const GEO_R = 6378137;
    const orgX = -1 * ((2 * GEO_R * Math.PI) / 2);
    const orgY = (2 * GEO_R * Math.PI) / 2;
    const unit = (2 * GEO_R * Math.PI) / Math.pow(2, z);
    const minx = orgX + x * unit;
    const maxx = orgX + (x + 1) * unit;
    const miny = orgY - (y + 1) * unit;
    const maxy = orgY - y * unit;
    return [minx, miny, maxx, maxy];
}

// 参考: https://qiita.com/Kanahiro/items/70b3b8b11bd26cbaf30e
const generateCogSource = async (
    url: string,
    id: number,
): Promise<{ source: RasterSourceSpecification }> => {
    const tiff = await fromUrl(url);
    const pool = new Pool();
    maplibregl.addProtocol(`cog${id}`, (params, callback) => {
        const segments = params.url.split('/');
        const [z, x, y] = segments.slice(segments.length - 3).map(Number);
        const bbox = merc(x, y, z);
        const size = 256;
        tiff.readRasters({
            bbox,
            samples: [0, 1, 2, 3], // 取得するバンドを指定
            width: size,
            height: size,
            interleave: true,
            pool,
        }).then((data) => {
            const img = new ImageData(
                //@ts-ignore
                new Uint8ClampedArray(data),
                size,
                size,
            );
            const png = encode(img);
            callback(null, png, null, null);
        });
        return { cancel: () => {} };
    });
    const source: RasterSourceSpecification = {
        type: 'raster',
        tiles: [`cog${id}://${url.split('://')[1]}/{z}/{x}/{y}`],
        tileSize: 512,
        minzoom: 1,
        maxzoom: 11,
        attribution: '© ONE COMPATH',
    };
    return { source };
};

const map = new Map({
    container: 'map',
    center: [139.036, 36.685],
    zoom: 1,
    minZoom: 1,
    maxZoom: 11,
    style: './style.json',
    hash: true,
});
map.addControl(new maplibregl.NavigationControl());

async function addWeather(id: number): Promise<void> {
    try {
        const idZero = ('000' + id).slice(-3);
        const cogPath = `https://mapion-vt-public-stg.s3.ap-northeast-1.amazonaws.com/lab/noaa/apcp/${targetDateFormatted}/18/${idZero}.tif`;
        // console.log('cogPath', cogPath);
        const { source } = await generateCogSource(cogPath, id);
        const sourceId = `weather-cog-${id}`;
        const layerId = `weather-cog-layer-${id}`;
        // console.log('layerId', layerId);
        map.addSource(sourceId, source);
        map.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            layout: {
                visibility: 'none',
            },
            paint: { 'raster-opacity': 0.7 },
        });
    } catch (e) {
        console.error(e);
    }
}

function switchWeather(id: number): void {
    const fourecastDate = document.getElementById('forecast-date') as HTMLElement;
    fourecastDate.textContent = `${id}時間後`;
    for (let i = 6; i <= 72; i+=6) {
        map.setLayoutProperty(`weather-cog-layer-${i}`, 'visibility', 'none');
    }
    map.setLayoutProperty(`weather-cog-layer-${id}`, 'visibility', 'visible');
}

map.on('load', async () => {
    for (let i = 6; i <= 72; i+=6) {
        await addWeather(i);
    }
    switchWeather(6);
});

const slider = document.getElementById('slider') as HTMLElement;
slider.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    const forecastTime = parseInt(target.value, 10);
    switchWeather(forecastTime);
});

function popupImage(): void {
    const popup = document.getElementById('js-popup') as HTMLElement;
    if(!popup) return;

    const blackBg = document.getElementById('js-black-bg') as HTMLElement;
    const closeBtn = document.getElementById('js-close-btn') as HTMLElement;
    const showBtn = document.getElementById('js-show-popup') as HTMLElement;

    closePopUp(blackBg);
    closePopUp(closeBtn);
    closePopUp(showBtn);
    function closePopUp(elem: HTMLElement): void {
        if(!elem) return;
        elem.addEventListener('click', function() {
            popup.classList.toggle('is-show');
        });
    }
}
popupImage();
