import express from 'express';
import cors from 'cors';
import { config as dotenvConfig } from 'dotenv';
import { SuiBlockchainService } from './services/sui-blockchain';
import { IdolCreateRequest, Env, NETWORKS, SuiNetwork } from './types';
import { Buffer } from 'buffer';

dotenvConfig();
const app = express();
app.use(express.json());
app.use(cors());

app.use((req, res, next) => {
    const start = Date.now();
    console.log("======================================================");
    console.log(`[Request] ${new Date().toISOString()}`);
    console.log(`[Request] ===> ${req.method} ${req.originalUrl}`);

    if (Object.keys(req.query).length > 0) {
        console.log('[Request] Query:', req.query);
    }
    if (req.method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
        console.log('[Request] Body:', JSON.stringify(req.body, null, 2));
    }
    console.log("------------------------------------------------------");

    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[Request] <=== ${req.method} ${req.originalUrl} - ${res.statusCode} [${duration}ms]`);
        console.log("======================================================");
    });

    next();
});

function parseNetwork(v: string | undefined): SuiNetwork {
    return (NETWORKS as readonly string[]).includes(v ?? '')
        ? (v as SuiNetwork)
        : 'testnet';
}

const env: Env = {
    SUI_SIGNER_SECRET_KEY: process.env.SUI_SIGNER_SECRET_KEY!,
    IAO_CONFIG_ID: process.env.IAO_CONFIG_ID!,
    IAO_REGISTRY_ID: process.env.IAO_REGISTRY_ID!,
    POOLS_CONFIG_ID: process.env.POOLS_CONFIG_ID!,
    POOLS_REGISTRY_ID: process.env.POOLS_REGISTRY_ID!,
    POOLS_PACKAGE_ID: process.env.POOLS_PACKAGE_ID,
    BONDING_CURVE_MODULE: process.env.BONDING_CURVE_MODULE,
    BONDING_CURVE_GLOBAL_CONFIG_ID: process.env.BONDING_CURVE_GLOBAL_CONFIG_ID,
    COINX_TYPE: process.env.COINX_TYPE,
    CLOCK_ID: process.env.CLOCK_ID!,
    FACTORY_PACKAGE_ID: process.env.FACTORY_PACKAGE_ID!,
    PORT: process.env.PORT ?? '3000',
    SUI_NETWORK: parseNetwork(process.env.SUI_NETWORK),
    IAO_ADMIN_CAP_ID: process.env.IAO_ADMIN_CAP_ID!,
    CETUS_GLOBAL_CONFIG_ID: process.env.CETUS_GLOBAL_CONFIG_ID!,
    CETUS_POOLS_ID: process.env.CETUS_POOLS_ID!,
    POOLS_ADMIN_CAP_ID: process.env.POOLS_ADMIN_CAP_ID!,
    CETUS_BURN_MANAGER_ID: process.env.CETUS_BURN_MANAGER_ID!,
    SUI_METADATA_ID: process.env.SUI_METADATA_ID!,
    GRADUATOR_PACKAGE_ID: process.env.GRADUATOR_PACKAGE_ID!,
};

const requiredEnv = [
    'SUI_SIGNER_SECRET_KEY', 'IAO_CONFIG_ID', 'IAO_REGISTRY_ID',
    'POOLS_CONFIG_ID', 'POOLS_REGISTRY_ID', 'CLOCK_ID', 'FACTORY_PACKAGE_ID', 'CETUS_GLOBAL_CONFIG_ID', 'CETUS_POOLS_ID',
    'IAO_ADMIN_CAP_ID', 'POOLS_ADMIN_CAP_ID', 'CETUS_BURN_MANAGER_ID', 'SUI_METADATA_ID', 'GRADUATOR_PACKAGE_ID'
];
for (const key of requiredEnv) {
    if (!env[key as keyof Env]) {
        console.error(`Error: Environment variable ${key} is not set. Please check your .env file.`);
        process.exit(1);
    }
}

const suiBlockchainService = new SuiBlockchainService(env);

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'SUI Blockchain Service is running' });
});

app.get('/marginal-price', async (req, res) => {
    try {
        const coinType = (req.query.coinType as string) || '';
        if (!coinType) return res.status(400).json({ error: 'Missing coinType query param' });
        const { price } = await suiBlockchainService.getMarginalPriceForIdol(coinType);

        // Normalize to human-readable SUI price using the same factor as computeMarketCaps
        const BONDING_CURVE_PRICE_FACTOR = 10_000;
        const priceInSui = (parseFloat(price) / BONDING_CURVE_PRICE_FACTOR).toString();

        res.status(200).json({ coinType, price: priceInSui, rawPrice: price });
    } catch (e: any) {
        res.status(500).json({ error: e.message || String(e) });
    }
});

app.get('/current-supply', async (req, res) => {
    try {
        const coinType = (req.query.coinType as string) || '';
        if (!coinType) return res.status(400).json({ error: 'Missing coinType query param' });
        const { supply } = await suiBlockchainService.getCurrentSupplyForIdol(coinType);
        res.status(200).json({ coinType, supply });
    } catch (e: any) {
        res.status(500).json({ error: e.message || String(e) });
    }
});

app.get('/current-supply-batch', async (req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const repeated = url.searchParams.getAll('coinType').filter(Boolean);
        const csv = (url.searchParams.get('coinTypes') || '').split(',').map(s => s.trim()).filter(Boolean);
        const coinTypes = Array.from(new Set([...repeated, ...csv]));

        if (coinTypes.length === 0) {
            return res.status(400).json({ error: 'Missing coinType(s) in query parameters.' });
        }

        const promises = coinTypes.map(async (coinType) => {
            try {
                const { supply } = await suiBlockchainService.getCurrentSupplyForIdol(coinType);
                return { coinType, supply };
            } catch (e: any) {
                return { coinType, error: e.message || String(e) };
            }
        });
        const results = await Promise.all(promises);
        res.status(200).json({ results });
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'Failed to fetch batch current supply' });
    }
});

app.post('/launch-idol', async (req, res) => {
    const { idolId, createParams } = req.body as { idolId: number; createParams: IdolCreateRequest };

    if (!idolId || !createParams) {
        return res.status(400).json({ error: 'Missing idolId or createParams in request body.' });
    }

    console.log("======================================================");
    console.log(`[DO Droplet] Received request to launch idol ID: ${idolId}`);
    console.log(`[DO Droplet] Ticker: ${createParams.ticker}, Name: ${createParams.name}`);
    console.log("------------------------------------------------------");

    try {
        console.log(`[DO Droplet] STEP 1: Publishing token package for idol ID: ${idolId}...`);
        const tokenPackageResult = await suiBlockchainService.publishIdolTokenPackage({
            ticker: createParams.ticker,
            name: createParams.name,
            description: createParams.description,
            decimals: createParams.decimals,
            imageUrl: createParams.imageUrl || "https://idol.fun/default-icon.png",
        });
        console.log(`[DO Droplet] SUCCESS: Token package published for idol ID: ${idolId}. Package ID: ${tokenPackageResult.packageId}`);

        console.log(`[DO Droplet] STEP 2: Registering asset with IAO protocol for idol ID: ${idolId}...`);
        const registerAssetResult = await suiBlockchainService.registerAsset(
            {
                packageId: tokenPackageResult.packageId,
                treasuryCapId: tokenPackageResult.treasuryCapId,
                moduleName: tokenPackageResult.moduleName,
                structName: tokenPackageResult.structName,
                coinType: tokenPackageResult.coinType,
            },
            createParams
        );
        console.log(`[DO Droplet] SUCCESS: Asset registered for idol ID: ${idolId}. Pool ID: ${registerAssetResult.poolId}`);
        console.log("======================================================");

        res.status(200).json({
            packageId: tokenPackageResult.packageId,
            treasuryCapId: tokenPackageResult.treasuryCapId,
            coinMetadataId: tokenPackageResult.coinMetadataId,
            moduleName: tokenPackageResult.moduleName,
            structName: tokenPackageResult.structName,
            coinType: tokenPackageResult.coinType,
            poolId: registerAssetResult.poolId,
            bondingCurveId: registerAssetResult.bondingCurveId,
            digest: registerAssetResult.digest,
            lpCapId: registerAssetResult.lpCapId,
            creatorTokensId: registerAssetResult.creatorTokensId,
        });

    } catch (error: any) {
        console.error(`[DO Droplet] FATAL ERROR launching idol ID: ${idolId}:`, error);
        console.log("======================================================");
        res.status(500).json({
            error: 'Failed to launch idol on SUI blockchain',
            details: error.message,
        });
    }
});

app.post('/graduate-idol', async (req, res) => {
    const { idolCoinType, idolCoinMetadataId } = req.body as { idolCoinType?: string; idolCoinMetadataId?: string };

    if (!idolCoinType || !idolCoinMetadataId) {
        return res.status(400).json({ error: 'Missing idolCoinType or idolCoinMetadataId in request body.' });
    }

    console.log("======================================================");
    console.log(`[DO Droplet] Received request to graduate idol: ${idolCoinType}`);
    console.log("------------------------------------------------------");

    try {
        const result = await suiBlockchainService.graduateIdol(idolCoinType, idolCoinMetadataId);

        console.log(`[DO Droplet] SUCCESS: Idol graduated. Digest: ${result.digest}`);
        console.log("======================================================");

        res.status(200).json({
            message: 'Idol successfully graduated into a Cetus CLMM pool.',
            digest: result.digest,
            events: result.events,
        });
    } catch (error: any) {
        console.error(`[DO Droplet] FATAL ERROR graduating idol:`, error);
        console.log("======================================================");
        res.status(500).json({
            error: 'Failed to graduate idol on SUI blockchain',
            details: error.message.includes('Balance of gas object')
                ? 'Insufficient gas in the server wallet to perform the graduation transaction.'
                : error.message,
        });
    }
});

app.post('/check-update-level', async (req, res) => {
    const { idolCoinType } = req.body;

    if (!idolCoinType) {
        return res.status(400).json({ error: 'Missing idolCoinType in request body.' });
    }

    console.log("======================================================");
    console.log(`[DO Droplet] Received request to check and update level for idol: ${idolCoinType}`);
    console.log("------------------------------------------------------");

    try {
        const result = await suiBlockchainService.checkAndUpdateLevel(idolCoinType);

        console.log(`[DO Droplet] SUCCESS: check_and_update_level executed. Transaction digest: ${result.digest}`);
        console.log("======================================================");

        res.status(200).json({
            message: 'Successfully executed check_and_update_level.',
            digest: result.digest,
            events: result.events,
        });
    } catch (error: any) {
        console.error(`[DO Droplet] FATAL ERROR during check_and_update_level:`, error);
        console.log("======================================================");
        res.status(500).json({
            error: 'Failed to execute check_and_update_level on SUI blockchain',
            details: error.message,
        });
    }
});

async function getStatsForBondingCurve(bondingCurveId: string, limit: number = 1000) {
    try {
        const events = await suiBlockchainService.getTradeEvents(bondingCurveId, limit);
        const volumeData = suiBlockchainService.calculateVolume(events);
        const holdersData = suiBlockchainService.calculateHolders(events);

        return {
            bondingCurveId,
            volume: volumeData,
            holders: {
                count: Object.keys(holdersData).length,
                wallets: holdersData,
            }
        };
    } catch (error: any) {
        console.error(`[DO Droplet] ERROR fetching stats for bonding curve ${bondingCurveId}:`, error);
        return {
            bondingCurveId,
            volume: null,
            holders: { count: 0, wallets: {} },
            error: error.message || 'Failed to fetch and calculate stats for the bonding curve'
        };
    }
}

app.get('/holders-volume', async (req, res) => {
    const { bondingCurveId, limit } = req.query;

    if (!bondingCurveId || typeof bondingCurveId !== 'string') {
        return res.status(400).json({ error: 'A single bondingCurveId query parameter is required.' });
    }

    console.log("======================================================");
    console.log(`[DO Droplet] Received request for stats for Bonding Curve ID: ${bondingCurveId}`);
    console.log("------------------------------------------------------");

    const result = await getStatsForBondingCurve(bondingCurveId, limit ? parseInt(limit as string, 10) : 1000);

    if (result.error) {
        console.log("======================================================");
        res.status(500).json(result);
    } else {
        console.log(`[DO Droplet] SUCCESS: Stats calculation complete. Transactions: ${result.volume!.transactionCount}, Holders: ${result.holders.count}`);
        console.log("======================================================");
        res.status(200).json(result);
    }
});

app.get('/holders-volume-batch', async (req, res) => {
    const { bondingCurveId: bondingCurveIdsQuery } = req.query;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 1000;

    let bondingCurveIds: string[] = [];
    if (Array.isArray(bondingCurveIdsQuery)) {
        bondingCurveIds = bondingCurveIdsQuery.filter((id): id is string => typeof id === 'string');
    } else if (typeof bondingCurveIdsQuery === 'string') {
        bondingCurveIds = [bondingCurveIdsQuery];
    }

    if (bondingCurveIds.length === 0) {
        return res.status(400).json({ error: 'Missing or invalid bondingCurveId query parameter(s).' });
    }
    const validIds = bondingCurveIds.filter(id => id.trim() !== '');

    try {
        const promises = validIds.map(id => getStatsForBondingCurve(id, limit));
        const results = await Promise.all(promises);

        res.status(200).json({ results });

    } catch (error: any) {
        console.error(`[DO Droplet] FATAL ERROR fetching batch stats:`, error);
        console.log("======================================================");
        res.status(500).json({
            error: 'Failed to fetch and calculate batch stats',
            details: error.message,
        });
    }
});

app.get('/getcurveliquidityreserve', async (req, res) => {
    try {
        const coinType = (req.query.coinType as string) || '';
        if (!coinType) return res.status(400).json({ error: 'Missing coinType query param' });

        const { rawReturn } = await suiBlockchainService.getCurveLiquidityReserveForIdol(coinType);

        const rawBytes = rawReturn[0][0];

        const buffer = Buffer.from(rawBytes);
        const rawLiquidityMist = buffer.readBigUInt64LE(0);

        const MIST_PER_SUI = 1_000_000_000n;
        const humanReadableLiquidity = Number(rawLiquidityMist) / Number(MIST_PER_SUI);

        res.status(200).json({
            coinType,
            liquidity_sui: humanReadableLiquidity,
            rawReturn: rawReturn
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message || String(e) });
    }
});

// Read-only: get curve state for a given idol coin type
// Usage: GET /curve-state?coinType=<PACKAGE::module::STRUCT>
app.get('/curve-state', async (req, res) => {
    try {
        const coinType = (req.query.coinType as string) || '';
        if (!coinType) return res.status(400).json({ error: 'Missing coinType query param' });
        const { state } = await suiBlockchainService.getCurveStateForIdol(coinType);
        res.status(200).json({ coinType, state });
    } catch (e: any) {
        res.status(500).json({ error: e.message || String(e) });
    }
});

// Read-only: get curve state for a batch of idol coin types
// Usage: GET /curve-state-batch?coinType=<ID1>&coinType=<ID2>
app.get('/curve-state-batch', async (req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const repeated = url.searchParams.getAll('coinType').filter(Boolean);
        const csv = (url.searchParams.get('coinTypes') || '').split(',').map(s => s.trim()).filter(Boolean);
        const coinTypes = Array.from(new Set([...repeated, ...csv]));

        if (coinTypes.length === 0) {
            return res.status(400).json({ error: 'Missing coinType(s) in query parameters.' });
        }

        const promises = coinTypes.map(async (coinType) => {
            try {
                const { state } = await suiBlockchainService.getCurveStateForIdol(coinType);
                return { coinType, state };
            } catch (e: any) {
                return { coinType, error: e.message || String(e) };
            }
        });
        const results = await Promise.all(promises);
        res.status(200).json({ results });
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'Failed to fetch batch curve states' });
    }
});

// Read-only: get market caps for a batch of idol coin types
// Usage: GET /market-caps?coinType=<ID1>&coinType=<ID2>
// Or:    GET /market-caps?coinTypes=<ID1>,<ID2>
app.get('/market-caps', async (req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const repeated = url.searchParams.getAll('coinType').filter(Boolean);
        const csv = (url.searchParams.get('coinTypes') || '').split(',').map(s => s.trim()).filter(Boolean);
        const coinTypes = Array.from(new Set([...repeated, ...csv]));

        if (coinTypes.length === 0) {
            return res.status(400).json({ error: 'Missing coinType(s) in query parameters.' });
        }

        const results = await suiBlockchainService.computeMarketCaps(coinTypes);
        res.status(200).json({ results });
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'Failed to compute market caps' });
    }
});

app.get('/level-status', async (req, res) => {
    try {
        const coinType = req.query.coinType as string;
        if (!coinType) {
            return res.status(400).json({ error: 'Missing coinType query parameter.' });
        }

        console.log("======================================================");
        console.log(`[DO Droplet] Received request for level status for: ${coinType}`);
        console.log("------------------------------------------------------");

        const levelData = await suiBlockchainService.getBondingCurveLevelManager(coinType);

        console.log(`[DO Droplet] SUCCESS: Fetched level data for ${coinType}.`);
        console.log("======================================================");

        res.status(200).json(levelData);

    } catch (e: any) {
        console.error(`[DO Droplet] FATAL ERROR fetching level status:`, e);
        console.log("======================================================");
        res.status(500).json({ error: e.message || String(e) });
    }
});

const port = Number(env.PORT ?? '3000');

app.listen(port, () => {
    console.log(`SUI Blockchain Service listening on port ${port}`);
});
