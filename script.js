/* =========================================
   PRODUCT DATA
========================================= */

const products = [

    {
        id: 1,
        name: "Nike Air Sprint",
        brand: "Nike",
        category: "Running",
        colour: "Black",
        price: 5500,
        visual: "nike-black",
        icon: "👟"
    },

    {
        id: 2,
        name: "Nike Red Runner",
        brand: "Nike",
        category: "Running",
        colour: "Red",
        price: 7200,
        visual: "nike-red",
        icon: "👟"
    },

    {
        id: 3,
        name: "Nike Blue Court",
        brand: "Nike",
        category: "Basketball",
        colour: "Blue",
        price: 8500,
        visual: "nike-blue",
        icon: "🥾"
    },

    {
        id: 4,
        name: "Adidas Daily Comfort",
        brand: "Adidas",
        category: "Casual",
        colour: "White",
        price: 2800,
        visual: "adidas-white",
        icon: "👟"
    },

    {
        id: 5,
        name: "Adidas Blue Runner",
        brand: "Adidas",
        category: "Running",
        colour: "Blue",
        price: 4500,
        visual: "adidas-blue",
        icon: "👟"
    },

    {
        id: 6,
        name: "Adidas Street Black",
        brand: "Adidas",
        category: "Casual",
        colour: "Black",
        price: 3500,
        visual: "adidas-black",
        icon: "👞"
    },

    {
        id: 7,
        name: "Puma Red Speed",
        brand: "Puma",
        category: "Training",
        colour: "Red",
        price: 5900,
        visual: "puma-red",
        icon: "🥾"
    },

    {
        id: 8,
        name: "Puma White Flex",
        brand: "Puma",
        category: "Training",
        colour: "White",
        price: 2900,
        visual: "puma-white",
        icon: "👟"
    },

    {
        id: 9,
        name: "Puma Urban Black",
        brand: "Puma",
        category: "Casual",
        colour: "Black",
        price: 4200,
        visual: "puma-black",
        icon: "👞"
    },

    {
        id: 10,
        name: "New Balance Blue Flow",
        brand: "New Balance",
        category: "Running",
        colour: "Blue",
        price: 6800,
        visual: "nb-blue",
        icon: "👟"
    },

    {
        id: 11,
        name: "New Balance White Walk",
        brand: "New Balance",
        category: "Casual",
        colour: "White",
        price: 3200,
        visual: "nb-white",
        icon: "👟"
    },

    {
        id: 12,
        name: "New Balance Red Court",
        brand: "New Balance",
        category: "Basketball",
        colour: "Red",
        price: 7600,
        visual: "nb-red",
        icon: "🥾"
    }

];


/* =========================================
   CURRENT USER
========================================= */

function getCurrentUser() {

    const userData =
        localStorage.getItem("currentUser");

    if (!userData) {

        return null;

    }

    return JSON.parse(userData);

}


/* =========================================
   EVENT IDENTIFIERS
========================================= */

/*
A session ends after 30 minutes with no
tracked activity; the next event starts a
new one.
*/

const SESSION_TIMEOUT_MS =
    30 * 60 * 1000;


function generateUuid() {

    /* crypto.randomUUID() only exists in
       secure contexts (https, localhost,
       file://). Anywhere else, build a v4
       UUID from getRandomValues(), which is
       always available. */

    if (crypto.randomUUID) {

        return crypto.randomUUID();

    }


    const bytes =
        crypto.getRandomValues(
            new Uint8Array(16)
        );


    // Version 4, RFC 4122 variant

    bytes[6] =
        (bytes[6] & 0x0f) | 0x40;

    bytes[8] =
        (bytes[8] & 0x3f) | 0x80;


    const hex =
        Array.from(
            bytes,
            byte => byte.toString(16).padStart(2, "0")
        ).join("");


    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20)
    ].join("-");

}


/*
Stable per browser. Created once and kept
across logins and logouts, so a visitor's
anonymous browsing and their signed-in
activity share one id.
*/

function getAnonymousId() {

    let anonymousId =
        localStorage.getItem("anonymousId");


    if (!anonymousId) {

        anonymousId =
            generateUuid();

        localStorage.setItem(
            "anonymousId",
            anonymousId
        );

    }


    return anonymousId;

}


/*
Kept in localStorage rather than
sessionStorage so every tab on the store
shares one session, the way analytics
tools usually count it.
*/

function getSessionId() {

    const now =
        Date.now();


    let sessionId =
        localStorage.getItem("sessionId");


    const lastActivity =
        Number(
            localStorage.getItem("sessionLastActivity")
        );


    if (
        !sessionId ||
        now - lastActivity > SESSION_TIMEOUT_MS
    ) {

        sessionId =
            generateUuid();

        localStorage.setItem(
            "sessionId",
            sessionId
        );

    }


    localStorage.setItem(
        "sessionLastActivity",
        String(now)
    );


    return sessionId;

}


/* =========================================
   CLICKSTREAM EVENT RECORDING
========================================= */

async function trackEvent(
    eventType,
    product = null,
    extraData = {}
) {

    const user = getCurrentUser();


    /* Required fields - the contract lives in
       docs/tracking-plan.md. */

    const eventData = {

        event_id:
            generateUuid(),

        session_id:
            getSessionId(),

        anonymous_id:
            getAnonymousId(),

        timestamp:
            new Date().toISOString(),

        event:
            eventType,

        /* Page the event happened on, so
           storefront events carry the same
           "page" field the synthetic
           producer sends. Taking the last
           path segment keeps this readable
           whether the site is served over
           http:// or opened as a file://
           path. */

        page:
            window.location.pathname
                .split("/")
                .pop() || "index.html"

    };


    /* Optional fields are left OUT when they
       do not apply, never sent as null or a
       placeholder. The absence of user_id is
       what marks anonymous traffic;
       anonymous_id carries continuity. */

    if (user) {

        eventData.user_id =
            user.customerId;

        eventData.user_name =
            user.username;

        eventData.age_group =
            user.ageGroup;

        eventData.gender =
            user.gender;

    }


    if (product) {

        eventData.product_id =
            product.id;

        eventData.product_name =
            product.name;

        eventData.brand =
            product.brand;

    }


    Object.assign(
        eventData,
        extraData
    );


    /* =====================================
       Display in Browser Console
    ===================================== */

    console.log(
        "CLICKSTREAM EVENT:",
        eventData
    );


    /* =====================================
       Send Event to Backend
    ===================================== */

    try {

        const response =
            await fetch(
                "/api/events",
                {

                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            eventData
                        )

                }
            );


        const result =
            await response.json();


        if (response.ok) {

            console.log(
                "Kafka response:",
                result
            );

        }

        else {

            console.error(
                "Kafka ingestion failed:",
                result
            );

        }

    }

    catch (error) {

        console.error(
            "Could not connect to clickstream API:",
            error
        );

    }

}


/* =========================================
   USER ID (DERIVED FROM MOBILE NUMBER)

   The mobile number is the login, but it
   never leaves the browser and is never
   stored: it is normalised, salted and
   SHA-256 hashed here, and only the first
   12 hex chars are kept. That value is stored as
   user.customerId, which trackEvent()
   already sends as user_id - so the payload
   field and trackEvent itself are unchanged.

   Same number -> same id, on any device, so
   a returning shopper gets their cart back.

   This is pseudonymisation, NOT anonymity:
   the salt ships in this file and there are
   only ~10^10 phone numbers, so anyone with
   the code can brute-force an id back to its
   number. It keeps raw numbers out of Kafka,
   Parquet and logs; it is not a secret.
========================================= */

const USER_ID_SALT =
    "solestream-user-id-v1:";

const USER_ID_LENGTH =
    12;

/* Stored on the profile so pre-hashing
   profiles (raw number as id) can be told
   apart and retired - see below. */

const USER_ID_VERSION =
    1;


/* "+91 98765 43210", "098765-43210" and
   "9876543210" are one person: keep the
   digits, drop a 91 / 0 prefix, and require
   exactly 10 left. Returns null otherwise. */

function normalisePhone(raw) {

    let digits =
        raw.replace(/\D/g, "");


    if (
        digits.length === 12
        &&
        digits.startsWith("91")
    ) {

        digits =
            digits.slice(2);

    }

    else if (
        digits.length === 11
        &&
        digits.startsWith("0")
    ) {

        digits =
            digits.slice(1);

    }


    return digits.length === 10
        ? digits
        : null;

}


async function deriveUserId(phone) {

    const input =
        USER_ID_SALT + phone;


    /* crypto.subtle exists only in secure
       contexts (https, localhost). The EC2
       demo is plain http, so fall back to
       the JS implementation below - same
       algorithm, same output. */

    let hex;

    if (window.crypto && crypto.subtle) {

        const digest =
            await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(input)
            );

        hex =
            Array.from(
                new Uint8Array(digest),
                byte => byte.toString(16).padStart(2, "0")
            ).join("");

    }

    else {

        hex =
            sha256Hex(input);

    }


    return hex.slice(
        0,
        USER_ID_LENGTH
    );

}


/* Plain SHA-256 (FIPS 180-4) over the
   UTF-8 bytes of `text`, for insecure
   contexts where crypto.subtle is absent.
   Checked against crypto.subtle and
   Python's hashlib. */

const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];


function sha256Hex(text) {

    const rotr = (x, n) =>
        (x >>> n) | (x << (32 - n));


    const bytes =
        new TextEncoder().encode(text);


    // Pad: 0x80, zeros, then the 64-bit
    // big-endian bit length

    const paddedLength =
        Math.ceil((bytes.length + 9) / 64) * 64;

    const padded =
        new Uint8Array(paddedLength);

    padded.set(bytes);

    padded[bytes.length] =
        0x80;

    const view =
        new DataView(padded.buffer);

    const bitLength =
        bytes.length * 8;

    view.setUint32(
        paddedLength - 8,
        Math.floor(bitLength / 0x100000000)
    );

    view.setUint32(
        paddedLength - 4,
        bitLength >>> 0
    );


    let hash = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];

    const w =
        new Uint32Array(64);


    for (let offset = 0; offset < paddedLength; offset += 64) {

        for (let i = 0; i < 16; i++) {

            w[i] =
                view.getUint32(offset + i * 4);

        }

        for (let i = 16; i < 64; i++) {

            const s0 =
                rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);

            const s1 =
                rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);

            w[i] =
                (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;

        }


        let [a, b, c, d, e, f, g, h] = hash;

        for (let i = 0; i < 64; i++) {

            const t1 =
                (h
                + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25))
                + ((e & f) ^ (~e & g))
                + SHA256_K[i]
                + w[i]) >>> 0;

            const t2 =
                ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22))
                + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;

            h = g;
            g = f;
            f = e;
            e = (d + t1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) >>> 0;

        }


        hash = [a, b, c, d, e, f, g, h].map(
            (value, i) => (hash[i] + value) >>> 0
        );

    }


    return hash
        .map(value => value.toString(16).padStart(8, "0"))
        .join("");

}


/* Profiles saved before ids were hashed
   hold the raw number as customerId, and
   trackEvent() would keep sending it. Drop
   them at load so that shopper logs in
   again and gets a hashed id; their cart
   carries over (see carryOverLegacyKeys). */

function retireUnhashedProfile() {

    const user =
        getCurrentUser();


    if (
        user
        &&
        user.idVersion !== USER_ID_VERSION
    ) {

        localStorage.removeItem(
            "currentUser"
        );

    }

}

retireUnhashedProfile();


/* A cart or likes stored under the old raw
   key (the number as typed, or normalised)
   moves to the hashed key, unless that
   already exists. Either way the raw-keyed
   copy is deleted. */

function carryOverLegacyKeys(
    rawCandidates,
    customerId
) {

    ["cart", "reactions"].forEach(prefix => {

        rawCandidates.forEach(raw => {

            const legacyKey =
                `${prefix}_${raw}`;

            const legacyValue =
                localStorage.getItem(legacyKey);


            if (legacyValue === null) {

                return;

            }


            if (
                localStorage.getItem(`${prefix}_${customerId}`) === null
            ) {

                localStorage.setItem(
                    `${prefix}_${customerId}`,
                    legacyValue
                );

            }


            localStorage.removeItem(
                legacyKey
            );

        });

    });

}


/* =========================================
   SAVE PROFILE / LOGIN
========================================= */

let savingProfile =
    false;


async function saveProfile() {

    if (savingProfile) {

        return;

    }


    const username =
        document
            .getElementById("username")
            .value
            .trim();


    const mobileNumber =
        document
            .getElementById("mobileNumber")
            .value
            .trim();


    const ageGroup =
        document
            .getElementById("ageGroup")
            .value;


    const gender =
        document
            .getElementById("gender")
            .value;


    const message =
        document.getElementById(
            "profileMessage"
        );


    if (
        username === "" ||
        mobileNumber === "" ||
        ageGroup === "" ||
        gender === ""
    ) {

        message.textContent =
            "Please complete all details.";

        return;

    }


    const phone =
        normalisePhone(mobileNumber);


    if (!phone) {

        message.textContent =
            "Please enter a 10-digit mobile number.";

        return;

    }


    savingProfile =
        true;


    /* The raw number stops here: only the
       derived id is stored or sent. */

    let customerId;

    try {

        customerId =
            await deriveUserId(phone);

    }

    catch (error) {

        savingProfile =
            false;

        message.textContent =
            "Something went wrong. Please try again.";

        console.error(
            "Could not derive user id:",
            error
        );

        return;

    }


    carryOverLegacyKeys(
        [mobileNumber, phone],
        customerId
    );


    const user = {

        username:
            username,

        customerId:
            customerId,

        ageGroup:
            ageGroup,

        gender:
            gender,

        idVersion:
            USER_ID_VERSION

    };


    localStorage.setItem(
        "currentUser",
        JSON.stringify(user)
    );


    /*
    Each customer gets their own cart, keyed
    by the derived id:

    cart_3f9a0c1d22be
    */


    if (
        !localStorage.getItem(
            `cart_${customerId}`
        )
    ) {

        localStorage.setItem(
            `cart_${customerId}`,
            JSON.stringify([])
        );

    }


    trackEvent(
        "user_login"
    );


    /* Saved: let the form work again (e.g.
       when Back restores this page). */

    savingProfile =
        false;


    message.textContent =
        "Profile saved. Redirecting to the shoe store...";


    setTimeout(() => {

        window.location.href =
            "shoes.html";

    }, 700);

}


/* =========================================
   USER-SPECIFIC CART
========================================= */

function getCart() {

    const user =
        getCurrentUser();


    if (!user) {

        return [];

    }


    return JSON.parse(

        localStorage.getItem(
            `cart_${user.customerId}`
        )

    )
    || [];

}


function saveCart(cart) {

    const user =
        getCurrentUser();


    if (!user) {

        return;

    }


    localStorage.setItem(

        `cart_${user.customerId}`,

        JSON.stringify(cart)

    );

}


/* =========================================
   USER REACTIONS
========================================= */

function getReactions() {

    const user =
        getCurrentUser();


    if (!user) {

        return {};

    }


    return JSON.parse(

        localStorage.getItem(
            `reactions_${user.customerId}`
        )

    )
    || {};

}


function saveReactions(reactions) {

    const user =
        getCurrentUser();


    if (!user) {

        return;

    }


    localStorage.setItem(

        `reactions_${user.customerId}`,

        JSON.stringify(reactions)

    );

}


/* =========================================
   LOAD SHOE PAGE
========================================= */

function initializeShop() {

    const productContainer =
        document.getElementById(
            "productContainer"
        );


    if (!productContainer) {

        return;

    }


    const user =
        getCurrentUser();


    if (!user) {

        alert(
            "Please enter your details first."
        );


        window.location.href =
            "index.html";

        return;

    }


    document.getElementById(
        "welcomeName"
    ).textContent =
        user.username;


    document.getElementById(
        "userDetails"
    ).textContent =
        `Shopper ID: ${user.customerId}
         | Age Group: ${user.ageGroup}`;


    displayProducts(products);

    updateCart();


    /*
    Filter event listeners
    */

    document
        .getElementById("brandFilter")
        .addEventListener(
            "change",
            filterProducts
        );


    document
        .getElementById("categoryFilter")
        .addEventListener(
            "change",
            filterProducts
        );


    document
        .getElementById("colourFilter")
        .addEventListener(
            "change",
            filterProducts
        );


    document
        .getElementById("priceFilter")
        .addEventListener(
            "change",
            filterProducts
        );


    trackEvent(
        "shop_page_view"
    );

}


/* =========================================
   DISPLAY PRODUCTS
========================================= */

function displayProducts(productList) {

    const container =
        document.getElementById(
            "productContainer"
        );


    const reactions =
        getReactions();


    /* A like/dislike re-renders the whole
       grid, so remember each card's chosen
       size and put it back afterwards. */

    const chosenSizes = {};

    container
        .querySelectorAll(".size-selector")
        .forEach(select => {

            chosenSizes[select.id] =
                select.value;

        });


    container.innerHTML = "";

    container.removeAttribute(
        "aria-busy"
    );


    productList.forEach(product => {

        const reaction =
            reactions[product.id]
            || "";


        const productCard =
            document.createElement("article");


        productCard.className =
            "product-card";


        productCard.innerHTML = `

            <div class="card-media">

                <span class="category-badge">

                    ${product.category}

                </span>


                <div
                    class="reaction-buttons"
                    role="group"
                    aria-label="Rate ${product.name}"
                >

                    <button
                        type="button"
                        class="like-button ${reaction === "like" ? "active" : ""}"
                        aria-pressed="${reaction === "like"}"
                        aria-label="Like"
                        title="Like"
                        onclick="reactToProduct(
                            ${product.id},
                            'like'
                        )"
                    >

                        ${ICONS.thumbUp}

                    </button>


                    <button
                        type="button"
                        class="dislike-button ${reaction === "dislike" ? "active" : ""}"
                        aria-pressed="${reaction === "dislike"}"
                        aria-label="Dislike"
                        title="Dislike"
                        onclick="reactToProduct(
                            ${product.id},
                            'dislike'
                        )"
                    >

                        ${ICONS.thumbDown}

                    </button>

                </div>


                ${shoeIllustration(product)}

            </div>


            <div class="product-info">

                <p class="brand-tag">

                    ${product.brand}

                </p>


                <h3 class="product-name">

                    ${product.name}

                </h3>


                <p class="product-meta">

                    <span
                        class="colour-dot"
                        style="background: ${SHOE_COLOURS[product.colour].upper}"
                    ></span>

                    ${product.colour}

                </p>


                <div class="price-row">

                    <span class="price">

                        ${formatPrice(product.price)}

                    </span>


                    <span class="price-tier tier-${priceTier(product.price).key}">

                        ${priceTier(product.price).label}

                    </span>

                </div>


                <label
                    class="size-label"
                    for="size-${product.id}"
                >

                    Size

                </label>


                <select
                    class="size-selector"
                    id="size-${product.id}"
                >

                    <option value="6">
                        6
                    </option>

                    <option value="7">
                        7
                    </option>

                    <option value="8">
                        8
                    </option>

                    <option value="9">
                        9
                    </option>

                    <option value="10">
                        10
                    </option>

                </select>


                <div class="card-actions">

                    <button
                        type="button"
                        class="cart-button"
                        onclick="addToCart(
                            ${product.id}
                        )"
                    >

                        Add to cart

                    </button>


                    <button
                        type="button"
                        class="buy-now-button"
                        onclick="openCheckout(
                            'single',
                            ${product.id}
                        )"
                    >

                        Buy now

                    </button>

                </div>

            </div>

        `;


        container.appendChild(
            productCard
        );


        const sizeSelect =
            productCard.querySelector(
                ".size-selector"
            );

        if (chosenSizes[sizeSelect.id]) {

            sizeSelect.value =
                chosenSizes[sizeSelect.id];

        }

    });


    /* Empty state: filters matched nothing */

    if (productList.length === 0) {

        container.innerHTML = `

            <div class="empty-state">

                <h3>

                    No shoes match those filters

                </h3>


                <p>

                    Try a different brand or price range, or start over.

                </p>


                <button
                    type="button"
                    class="secondary-button"
                    onclick="clearFilters()"
                >

                    Clear all filters

                </button>

            </div>

        `;

    }


    document.getElementById(
        "productCount"
    ).textContent =
        productList.length === products.length
            ? `${products.length} shoes`
            : `${productList.length} of ${products.length} shoes`;


    syncFilterControls();

}


/* =========================================
   FILTER PRODUCTS
========================================= */

function filterProducts() {

    const brand =
        document.getElementById(
            "brandFilter"
        ).value;


    const category =
        document.getElementById(
            "categoryFilter"
        ).value;


    const colour =
        document.getElementById(
            "colourFilter"
        ).value;


    const priceRange =
        document.getElementById(
            "priceFilter"
        ).value;


    let filteredProducts =
        products.filter(product => {


            const brandMatch =
                brand === "all"
                ||
                product.brand === brand;


            const categoryMatch =
                category === "all"
                ||
                product.category === category;


            const colourMatch =
                colour === "all"
                ||
                product.colour === colour;


            let priceMatch =
                true;


            if (
                priceRange === "0-3000"
            ) {

                priceMatch =
                    product.price < 3000;

            }


            else if (
                priceRange === "3000-6000"
            ) {

                priceMatch =
                    product.price >= 3000
                    &&
                    product.price <= 6000;

            }


            else if (
                priceRange === "6000+"
            ) {

                priceMatch =
                    product.price > 6000;

            }


            return (
                brandMatch
                &&
                categoryMatch
                &&
                colourMatch
                &&
                priceMatch
            );

        });


    displayProducts(
        filteredProducts
    );


    trackEvent(
        "filter_applied",
        null,
        {

            brand_filter:
                brand,

            category_filter:
                category,

            colour_filter:
                colour,

            price_filter:
                priceRange

        }
    );

}


/* =========================================
   CLEAR FILTERS
========================================= */

function clearFilters() {

    document.getElementById(
        "brandFilter"
    ).value =
        "all";


    document.getElementById(
        "categoryFilter"
    ).value =
        "all";


    document.getElementById(
        "colourFilter"
    ).value =
        "all";


    document.getElementById(
        "priceFilter"
    ).value =
        "all";


    displayProducts(
        products
    );


    trackEvent(
        "filters_cleared"
    );

}


/* =========================================
   LIKE / DISLIKE
========================================= */

function reactToProduct(
    productId,
    reactionType
) {

    const reactions =
        getReactions();


    const product =
        products.find(
            p => p.id === productId
        );


    /*
    Clicking the same reaction again
    removes the reaction.
    */

    if (
        reactions[productId]
        ===
        reactionType
    ) {

        delete reactions[productId];


        trackEvent(
            "reaction_removed",
            product,
            {

                reaction:
                    reactionType

            }
        );

    }

    else {

        reactions[productId] =
            reactionType;


        trackEvent(
            reactionType,
            product
        );

    }


    saveReactions(
        reactions
    );


    /*
    Refresh current products
    so active button updates
    */

    filterProducts();

}


/* =========================================
   ADD TO CART
========================================= */

function addToCart(productId) {

    const cart =
        getCart();


    const product =
        products.find(
            p => p.id === productId
        );


    const size =
        document.getElementById(
            `size-${productId}`
        ).value;


    const cartItem = {

        ...product,

        selectedSize:
            size

    };


    cart.push(
        cartItem
    );


    saveCart(
        cart
    );


    updateCart();


    trackEvent(
        "add_to_cart",
        product,
        {

            selected_size:
                size

        }
    );


    showToast(
        `Added ${product.name}, size ${size}`,
        "View cart",
        openCart
    );

}


/* =========================================
   REMOVE FROM CART
========================================= */

function removeFromCart(index) {

    const cart =
        getCart();


    const removedProduct =
        cart[index];


    cart.splice(
        index,
        1
    );


    saveCart(
        cart
    );


    updateCart();


    trackEvent(
        "remove_from_cart",
        removedProduct
    );

}


/* =========================================
   UPDATE CART
========================================= */

function updateCart() {

    const cart =
        getCart();


    const cartItems =
        document.getElementById(
            "cartItems"
        );


    if (!cartItems) {

        return;

    }


    const cartCount =
        document.getElementById(
            "cartCount"
        );


    const cartTotal =
        document.getElementById(
            "cartTotal"
        );


    /* Bump the badge when the count goes up,
       so an add registers even with the
       drawer closed. */

    cartCount.textContent =
        cart.length;

    cartCount.dataset.count =
        cart.length;

    if (cart.length > lastCartCount) {

        cartCount.classList.remove("bump");

        void cartCount.offsetWidth;

        cartCount.classList.add("bump");

    }

    lastCartCount =
        cart.length;


    const checkoutButton =
        document.getElementById(
            "checkoutButton"
        );


    if (
        cart.length === 0
    ) {

        cartItems.innerHTML = `

            <div class="cart-empty">

                <p>

                    Your cart is empty.

                </p>


                <button
                    type="button"
                    class="secondary-button"
                    onclick="closeCart()"
                >

                    Keep browsing

                </button>

            </div>

        `;


        cartTotal.textContent =
            formatPrice(0);

        checkoutButton.disabled =
            true;

        return;

    }


    cartItems.innerHTML =
        "";


    let total =
        0;


    cart.forEach(
        (item, index) => {


            total +=
                item.price;


            const itemElement =
                document.createElement(
                    "div"
                );


            itemElement.className =
                "cart-item";


            itemElement.innerHTML = `

                <div class="cart-thumb">

                    ${shoeIllustration(item)}

                </div>


                <div class="cart-item-info">

                    <p class="cart-item-brand">

                        ${item.brand}

                    </p>


                    <p class="cart-item-name">

                        ${item.name}

                    </p>


                    <p class="cart-item-meta">

                        Size ${item.selectedSize} · ${item.colour}

                    </p>

                </div>


                <div class="cart-item-side">

                    <span class="cart-item-price">

                        ${formatPrice(item.price)}

                    </span>


                    <button
                        type="button"
                        class="remove-button"
                        onclick="removeFromCart(
                            ${index}
                        )"
                    >

                        Remove

                    </button>

                </div>

            `;


            cartItems.appendChild(
                itemElement
            );

        }
    );


    cartTotal.textContent =
        formatPrice(total);

    checkoutButton.disabled =
        false;

}


/* =========================================
   BUY SINGLE PRODUCT
========================================= */

function buySingleProduct(productId) {

    const product =
        products.find(
            p => p.id === productId
        );


    const size =
        document.getElementById(
            `size-${productId}`
        ).value;


    trackEvent(
        "buy_now",
        product,
        {

            selected_size:
                size

        }
    );


    showOrderConfirmation(
        [
            {
                ...product,
                selectedSize: size
            }
        ],
        product.price
    );

}


/* =========================================
   BUY ENTIRE CART
========================================= */

function buyCart() {

    const cart =
        getCart();


    if (
        cart.length === 0
    ) {

        closeCheckout();

        showToast(
            "Your cart is empty."
        );

        return;

    }


    const total =
        cart.reduce(
            (sum, item) =>
                sum + item.price,
            0
        );


    trackEvent(
        "cart_purchase",
        null,
        {

            items_purchased:
                cart.length,

            total_amount:
                total

        }
    );


    /*
    Clear only THIS user's cart
    */

    saveCart(
        []
    );


    updateCart();


    showOrderConfirmation(
        cart,
        total
    );

}


/* =========================================
   OPEN / CLOSE CART DRAWER
========================================= */

function openCart() {

    const cart =
        document.getElementById(
            "cart"
        );


    if (cart) {

        cart.inert =
            false;

        document.body.classList.add(
            "cart-open"
        );

        cart
            .querySelector(".icon-button")
            .focus();

    }


    trackEvent(
        "view_cart"
    );

}


function closeCart() {

    const cart =
        document.getElementById(
            "cart"
        );


    if (!cart) {

        return;

    }


    document.body.classList.remove(
        "cart-open"
    );

    cart.inert =
        true;

}


/* =========================================
   CHECKOUT (REVIEW -> CONFIRM)

   Buying is two steps: Buy now / Checkout
   opens a review, and only "Place order"
   calls buySingleProduct() / buyCart().
   Closing the review is an abandonment,
   and it sends nothing.
========================================= */

let pendingCheckout =
    null;


function openCheckout(
    mode,
    productId = null
) {

    let items;


    if (mode === "single") {

        const product =
            products.find(
                p => p.id === productId
            );

        const size =
            document.getElementById(
                `size-${productId}`
            ).value;

        items = [
            {
                ...product,
                selectedSize: size
            }
        ];

    }

    else {

        items =
            getCart();

    }


    if (items.length === 0) {

        showToast(
            "Your cart is empty."
        );

        return;

    }


    pendingCheckout = {
        mode: mode,
        productId: productId
    };


    const user =
        getCurrentUser();

    const total =
        items.reduce(
            (sum, item) =>
                sum + item.price,
            0
        );


    document.getElementById(
        "checkoutBody"
    ).innerHTML = `

        <div class="checkout-header">

            <h2 id="checkoutTitle">

                Review your order

            </h2>


            <button
                type="button"
                class="icon-button"
                onclick="closeCheckout()"
                aria-label="Close"
            >

                ${ICONS.close}

            </button>

        </div>


        <ul class="checkout-items">

            ${items.map(item => `

                <li class="checkout-item">

                    <div class="cart-thumb">

                        ${shoeIllustration(item)}

                    </div>


                    <div class="cart-item-info">

                        <p class="cart-item-name">

                            ${item.name}

                        </p>


                        <p class="cart-item-meta">

                            Size ${item.selectedSize} · ${item.colour}

                        </p>

                    </div>


                    <span class="cart-item-price">

                        ${formatPrice(item.price)}

                    </span>

                </li>

            `).join("")}

        </ul>


        <dl class="checkout-summary">

            <div class="summary-row">

                <dt>Subtotal</dt>

                <dd>${formatPrice(total)}</dd>

            </div>


            <div class="summary-row">

                <dt>Delivery</dt>

                <dd>Free</dd>

            </div>


            <div class="summary-row summary-total">

                <dt>Total</dt>

                <dd>${formatPrice(total)}</dd>

            </div>

        </dl>


        <p class="checkout-delivery">

            Delivering to <strong>${user ? escapeHtml(user.username) : "you"}</strong>
            by <strong>${deliveryDate()}</strong>.
            Pay on delivery · 7-day returns.

        </p>


        <div class="checkout-actions">

            <button
                type="button"
                class="buy-button"
                onclick="confirmCheckout()"
            >

                Place order · ${formatPrice(total)}

            </button>


            <button
                type="button"
                class="secondary-button"
                onclick="closeCheckout()"
            >

                ${mode === "single" ? "Keep browsing" : "Back to cart"}

            </button>

        </div>

    `;


    closeCart();

    document
        .getElementById("checkoutDialog")
        .showModal();

}


function confirmCheckout() {

    if (!pendingCheckout) {

        return;

    }


    const checkout =
        pendingCheckout;

    pendingCheckout =
        null;


    if (checkout.mode === "single") {

        buySingleProduct(
            checkout.productId
        );

    }

    else {

        buyCart();

    }

}


function closeCheckout() {

    pendingCheckout =
        null;


    const dialog =
        document.getElementById(
            "checkoutDialog"
        );


    if (dialog && dialog.open) {

        dialog.close();

    }

}


function showOrderConfirmation(
    items,
    total
) {

    const itemCount =
        items.length;


    document.getElementById(
        "checkoutBody"
    ).innerHTML = `

        <div class="order-confirmed">

            <div
                class="confirmed-mark"
                aria-hidden="true"
            >

                ${ICONS.check}

            </div>


            <h2 id="checkoutTitle">

                Order placed

            </h2>


            <p>

                ${itemCount} ${itemCount === 1 ? "item" : "items"} ·
                ${formatPrice(total)}
                · arriving by ${deliveryDate()}

            </p>


            <p class="order-ref">

                Order #SS-${Math.floor(100000 + Math.random() * 900000)}

            </p>


            <button
                type="button"
                class="buy-button"
                onclick="closeCheckout()"
            >

                Continue shopping

            </button>

        </div>

    `;


    const dialog =
        document.getElementById(
            "checkoutDialog"
        );


    if (!dialog.open) {

        dialog.showModal();

    }

}


/* =========================================
   UI HELPERS

   Presentation only: nothing below calls
   trackEvent().
========================================= */

let lastCartCount =
    Infinity;


const SHOE_COLOURS = {

    Black: {
        upper: "#26231F",
        trim: "#57514A",
        sole: "#EFEAE0"
    },

    White: {
        upper: "#F7F5F0",
        trim: "#CFC7B8",
        sole: "#D9D2C4"
    },

    Red: {
        upper: "#B8322A",
        trim: "#7E1E18",
        sole: "#F3EEE6"
    },

    Blue: {
        upper: "#2D5A9B",
        trim: "#1C3B69",
        sole: "#F3EEE6"
    }

};


const ICONS = {

    thumbUp:
        `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v10H4V10h3Zm0 0 4-7c1.7 0 2.6 1.2 2.2 2.8L12.5 9H18a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 16.8 20H7" /></svg>`,

    thumbDown:
        `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 14V4h3v10h-3Zm0 0-4 7c-1.7 0-2.6-1.2-2.2-2.8l.7-3.2H6a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 7.2 4H17" /></svg>`,

    close:
        `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>`,

    check:
        `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>`

};


/* For free text the shopper typed (their
   name) before it goes into innerHTML. */

function escapeHtml(text) {

    const holder =
        document.createElement("span");

    holder.textContent =
        text;

    return holder.innerHTML;

}


function formatPrice(amount) {

    return "₹" + amount.toLocaleString("en-IN");

}


/* Tiers use the same boundaries as the
   price filter, so the label on a card
   always agrees with the filter. */

function priceTier(price) {

    if (price < 3000) {

        return {
            key: "budget",
            label: "Under ₹3k"
        };

    }


    if (price <= 6000) {

        return {
            key: "mid",
            label: "Mid-range"
        };

    }


    return {
        key: "premium",
        label: "Premium"
    };

}


function deliveryDate() {

    const date =
        new Date(
            Date.now() + 4 * 24 * 60 * 60 * 1000
        );


    return date.toLocaleDateString(
        "en-IN",
        {
            weekday: "short",
            day: "numeric",
            month: "short"
        }
    );

}


/* Drawn, not photographed: colour comes
   from the product's colour, the cut from
   its category (court shoes are high-tops)
   and casual shoes get a gum sole. */

function shoeIllustration(product) {

    const colours =
        SHOE_COLOURS[product.colour];


    const sole =
        product.category === "Casual"
            ? "#C99A5B"
            : colours.sole;


    const upper =
        product.category === "Basketball"
            ? "M28 100 C26 80 28 52 34 36 C37 27 45 22 55 22 L100 22 C110 22 116 28 118 38 L126 56 C138 68 170 70 198 74 L214 78 C224 82 228 90 226 100 Z"
            : "M24 100 C22 86 26 74 38 70 L78 64 C92 62 100 52 110 42 L124 30 C130 25 138 26 142 32 L152 46 C160 58 176 66 196 72 L214 78 C224 82 228 90 226 100 Z";


    const detail =
        product.category === "Basketball"
            ? `<path d="M32 58 L112 50" stroke="${colours.trim}" stroke-width="5" stroke-linecap="round" />`
            : product.category === "Training"
                ? `<path d="M180 72 C204 76 222 84 226 100 L190 100 C190 88 186 78 180 72 Z" fill="${colours.trim}" />`
                : "";


    return `
        <svg
            class="shoe-art"
            viewBox="0 0 240 140"
            role="img"
            aria-label="${product.colour} ${product.category.toLowerCase()} shoe"
        >
            <ellipse cx="124" cy="124" rx="100" ry="7" fill="rgba(27,25,22,0.12)" />
            <path d="M18 100 L230 100 C232 106 230 114 222 116 L30 116 C22 116 16 110 18 100 Z" fill="${sole}" stroke="${colours.trim}" stroke-width="1.5" />
            <path d="${upper}" fill="${colours.upper}" stroke="${colours.trim}" stroke-width="1.5" />
            ${detail}
            <path d="M62 92 C104 88 146 72 186 78" fill="none" stroke="${colours.trim}" stroke-width="6" stroke-linecap="round" />
            <path d="M118 44 L136 52 M126 37 L144 46 M134 31 L150 41" stroke="${colours.trim}" stroke-width="3" stroke-linecap="round" />
        </svg>
    `;

}


/* Highlight the filters that are narrowing
   the grid, and only enable "Clear all"
   when there is something to clear. */

function syncFilterControls() {

    const filterIds = [
        "brandFilter",
        "categoryFilter",
        "colourFilter",
        "priceFilter"
    ];


    let activeCount =
        0;


    filterIds.forEach(id => {

        const select =
            document.getElementById(id);

        if (!select) {

            return;

        }

        const isActive =
            select.value !== "all";

        select
            .closest(".filter-pill")
            .classList.toggle(
                "is-active",
                isActive
            );

        if (isActive) {

            activeCount++;

        }

    });


    const clearButton =
        document.querySelector(
            ".clear-filter"
        );


    if (clearButton) {

        clearButton.disabled =
            activeCount === 0;

        clearButton.textContent =
            activeCount === 0
                ? "Clear all"
                : `Clear all (${activeCount})`;

    }

}


let toastTimer =
    null;


function showToast(
    message,
    actionLabel = null,
    action = null
) {

    const toast =
        document.getElementById(
            "toast"
        );


    if (!toast) {

        return;

    }


    toast.innerHTML = "";


    const text =
        document.createElement("span");

    text.textContent =
        message;

    toast.appendChild(text);


    if (actionLabel && action) {

        const button =
            document.createElement("button");

        button.type =
            "button";

        button.textContent =
            actionLabel;

        button.addEventListener(
            "click",
            () => {

                hideToast();

                action();

            }
        );

        toast.appendChild(button);

    }


    toast.classList.add(
        "is-visible"
    );


    clearTimeout(toastTimer);

    toastTimer =
        setTimeout(
            hideToast,
            3500
        );

}


function hideToast() {

    const toast =
        document.getElementById(
            "toast"
        );


    if (toast) {

        toast.classList.remove(
            "is-visible"
        );

    }

}


/* Escape closes the drawer (the dialog
   handles Escape itself), and closing the
   dialog any way clears the pending order. */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Escape"
            &&
            document.body.classList.contains("cart-open")
        ) {

            closeCart();

        }

    }
);


document.addEventListener(
    "DOMContentLoaded",
    () => {

        const dialog =
            document.getElementById(
                "checkoutDialog"
            );


        if (dialog) {

            dialog.addEventListener(
                "close",
                () => {

                    pendingCheckout =
                        null;

                }
            );

        }

    }
);


/* =========================================
   PAGE VIEW TRACKING
========================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {


        initializeShop();

    }
);