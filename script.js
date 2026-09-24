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
                "http://localhost:5000/api/events",
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


    container.innerHTML = "";


    productList.forEach(product => {

        const reaction =
            reactions[product.id]
            || "";


        const productCard =
            document.createElement("div");


        productCard.className =
            "product-card";


        productCard.innerHTML = `

            <div class="shoe-visual ${product.visual}">

                <div class="brand-icon">

                    ${product.brand}

                </div>


                <div class="shoe-icon">

                    ${product.icon}

                </div>

            </div>


            <div class="product-info">

                <span class="brand-tag">

                    ${product.brand}

                </span>


                <h3>

                    ${product.name}

                </h3>


                <p>

                    Category:
                    ${product.category}

                </p>


                <p>

                    Colour:
                    ${product.colour}

                </p>


                <p class="price">

                    ₹${product.price}

                </p>


                <label>

                    Select Size

                </label>


                <select
                    class="size-selector"
                    id="size-${product.id}"
                >

                    <option value="6">
                        Size 6
                    </option>

                    <option value="7">
                        Size 7
                    </option>

                    <option value="8">
                        Size 8
                    </option>

                    <option value="9">
                        Size 9
                    </option>

                    <option value="10">
                        Size 10
                    </option>

                </select>


                <div class="reaction-buttons">


                    <button
                        class="like-button ${reaction === "like" ? "active" : ""}"
                        onclick="reactToProduct(
                            ${product.id},
                            'like'
                        )"
                    >

                        👍 Like

                    </button>


                    <button
                        class="dislike-button ${reaction === "dislike" ? "active" : ""}"
                        onclick="reactToProduct(
                            ${product.id},
                            'dislike'
                        )"
                    >

                        👎 Dislike

                    </button>


                </div>


                <button
                    class="cart-button"
                    onclick="addToCart(
                        ${product.id}
                    )"
                >

                    Add to Cart

                </button>


                <button
                    class="buy-now-button"
                    onclick="buySingleProduct(
                        ${product.id}
                    )"
                >

                    Buy Now

                </button>

            </div>

        `;


        container.appendChild(
            productCard
        );

    });


    document.getElementById(
        "productCount"
    ).textContent =
        `${productList.length} shoes found`;

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


    alert(
        `${product.name} added to your cart!`
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


    cartCount.textContent =
        cart.length;


    if (
        cart.length === 0
    ) {

        cartItems.innerHTML =
            "Your cart is empty.";


        cartTotal.textContent =
            "0";

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

                <div>

                    <strong>

                        ${item.name}

                    </strong>

                    <br>

                    Size:
                    ${item.selectedSize}

                    |

                    ₹${item.price}

                </div>


                <button
                    class="remove-button"
                    onclick="removeFromCart(
                        ${index}
                    )"
                >

                    Remove

                </button>

            `;


            cartItems.appendChild(
                itemElement
            );

        }
    );


    cartTotal.textContent =
        total;

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


    alert(
        `ORDER PLACED SUCCESSFULLY!\n\n${product.name}\nSize: ${size}\nAmount: ₹${product.price}`
    );

}


/* =========================================
   BUY ENTIRE CART
========================================= */

function buyCart() {

    const cart =
        getCart();


    const orderMessage =
        document.getElementById(
            "orderMessage"
        );


    if (
        cart.length === 0
    ) {

        orderMessage.textContent =
            "Your cart is empty.";

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


    orderMessage.innerHTML =
        `
        🎉 ORDER PLACED SUCCESSFULLY! 🎉
        <br>
        ${cart.length} item(s) purchased.
        <br>
        Total: ₹${total}
        `;


    setTimeout(() => {

        orderMessage.textContent =
            "";

    }, 8000);

}


/* =========================================
   SCROLL TO CART
========================================= */

function scrollToCart() {

    const cart =
        document.getElementById(
            "cart"
        );


    if (cart) {

        cart.scrollIntoView({

            behavior:
                "smooth"

        });

    }


    trackEvent(
        "view_cart"
    );

}


/* =========================================
   PAGE VIEW TRACKING
========================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {


        initializeShop();

    }
);