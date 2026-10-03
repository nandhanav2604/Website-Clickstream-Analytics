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
   SAVE PROFILE / LOGIN
========================================= */

function saveProfile() {

    const username =
        document
            .getElementById("username")
            .value
            .trim();


    const customerId =
        document
            .getElementById("customerId")
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
        customerId === "" ||
        ageGroup === "" ||
        gender === ""
    ) {

        message.textContent =
            "Please complete all details.";

        return;

    }


    const user = {

        username:
            username,

        customerId:
            customerId,

        ageGroup:
            ageGroup,

        gender:
            gender

    };


    localStorage.setItem(
        "currentUser",
        JSON.stringify(user)
    );


    /*
    Each customer gets their own cart.

    Example:

    cart_9876543210

    cart_CUST001
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
        `Customer ID: ${user.customerId}
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