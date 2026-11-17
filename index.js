import express from "express";
import pg from 'pg';
import session from 'express-session';
import path from 'node:path';
import { fileURLToPath } from "node:url";
import { diff } from "node:util";
require('dotenv').config();

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const { Pool } = pg;

/* express and port declaration */
const app = express();
const port = 3000;

// database declaration
const pool = new Pool({
    connectionString: process.env.DATABASE
});

// view engine for ejs 
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// express and bodyparser declaration
app.use(express.urlencoded({ extended: true }));

// middleware
app.use(express.static("public"));

// session middleware
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false
    })
);

// request handlers
app.get("/", (req, res) => {
    res.render("index.ejs", {
        title: "Home Page"
    });
});

// sign up handler
app.get("/signup", (req, res) => {
    res.render("signup.ejs", {
        title: "Sign Up",
        error: null
    });
});

// database check for user
app.post('/signup', async (req, res) => {
    // get user information
    const { user_id, password, name } = req.body;

    try {
        // find if user exists
        const exists = await pool.query('SELECT * FROM users WHERE user_id=$1', [user_id]);

        // if rows are returned
        if (exists.rows.length > 0) {
            // user already exists
            return res.render('signup.ejs', {
                title: "Sign Up",
                error: "User already exists. Sign in or create a new user."
            });
        }

        // add user into database
        await pool.query('INSERT INTO users (user_id, password, name) VALUES ($1,$2,$3)', [user_id, password, name]);

        // go to sign in page
        res.redirect('/signin');
    } catch (err) {
        // return error if creation fails
        console.error(err);
        res.send("Error creating user. Try again later.");
    }
});

// sign out form handler
app.get('/signout', async (req, res) => {
    res.render('signout.ejs', {
        title: "Sign Out",
        error: null
    });
});

// sign the user out
app.post('/signout', async (req, res) => {
    // end the session
    req.session.destroy((err) => {
        // if session ending failed
        if (err) {
            // return error and display to user
            return res.status(500).render('signout', {
                title: "Sign Out",
                error: "There was an error signing out. Try again."
            });
        }

        // redirect to homepage
        res.redirect("/");
    });
});

// signin page handler
app.get('/signin', (req, res) => {
    res.render('signin.ejs', {
        title: "Sign In",
        error: null
    });
});

// sigin post handler
app.post('/signin', async (req, res) => {
    const { user_id, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE user_id=$1 AND password=$2', [user_id, password]);

    if (result.rows.length === 0) {
        return res.render('signin', {
            title: "Sign In",
            error: "Username or password is incorrect."
        });
    }   

    // store session storage variables
    req.session.userId = result.rows[0].user_id;
    req.session.userName = result.rows[0].name;

    // go back to hompeage
    res.redirect("/");
});

// submit recipe handler
app.get("/recipe_submit", async (req, res) => {
    // check fif user is signed in
    if (!req.session.userId) {
        return res.redirect("/signin");
    }

    try {
        // send over information to submission page
        res.render("recipe_submission.ejs", {
            title: "Recipe Submission",
            error: null,
        });

    } catch (err) {
        console.error(err);
        res.send("Error submitting recipe. Try again later.");
    }
});

// submit recipe post request
app.post("/recipe_submit", async (req, res) => {
    // check fif user is signed in
    if (!req.session.userId) {
        return res.redirect("/signin");
    }

    // store information from post request
    const { title, description, instructions, time_to_cook, servings, difficulty, tag, category } = req.body;
    
    // store session user id
    const user_id = req.session.userId;
    
    try {
        // insert recipe into database
        const result = await pool.query('INSERT INTO recipes (user_id, title, description, instructions, time_to_cook, servings, difficulty, dietary_tag, meal_category) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING recipe_id', [user_id, title, description, instructions, time_to_cook, servings, difficulty, tag, category]);

        // if database addition failed
        if (result.rowCount !== 1) {
            // return error
            return res.render('recipe_submission', {
                title: "Recipe Submission",
                error: "Submission failed. Try again.",
            });
        }  

        // redirect back to home page
        res.redirect("/");

    } catch (err) {
        // return error if creation fails
        return res.status(500).render('recipe_submission', {
            title: "Recipe Submission",
            error: "There was an error submitting the recipe. Try again.",
        });
    }
});

// view recipe handler
app.get("/view_recipe", async (req, res) => {
    // store filters if received
    const { time, difficulty } = req.body;

    try {
        // initialize result variable
        let result;

        // if both filters selected
        if (time && difficulty) {
            result = await pool.query('SELECT * FROM recipes WHERE time_to_cook <= $1 AND difficulty = $2 ORDER BY recipe_id DESC', [time, difficulty]);
        }
        // if time filter selected
        else if (time) {
            result = await pool.query('SELECT * FROM recipes WHERE time_to_cook <= $1 ORDER BY recipe_id DESC', [time]);
        }
        // if difficulty filter selected
        else if (difficulty) {
            result = await pool.query('SELECT * FROM recipes WHERE difficulty = $1 ORDER BY recipe_id DESC', [difficulty]);
        } 
        // otherwise, display all recipes
        else {
            result = await pool.query('SELECT * FROM recipes ORDER BY recipe_id DESC');
        }

        // render the page and pass returned recipes
        res.render("recipe_view.ejs", {
            title: "View Recipes",
            error: null,
            recipes: result.rows
        });
    } catch (err) {
        // display error for failure to display recipes
        console.error(err);
        res.send("Error displaying recipes. Try again later.");
    }
});

// rate recipe handler
app.post("/rate_recipe", async (req, res) => {
    // check fif user is signed in
    if (!req.session.userId) {
        return res.redirect("/signin");
    }

    // store recipe id and score
    const { recipe_id, score, review } = req.body;
    
    // store user's id
    const user_id = req.session.userId;

    try {
        // insert information into ratings table
        const result = await pool.query('INSERT INTO ratings (user_id, recipe_id, score, review) VALUES ($1,$2,$3,$4)', [user_id, recipe_id, score, review]);

        // if database addition failed
        if (result.rowCount !== 1) {
            // return error
            return res.render('recipe_view', {
                title: "View Recipes",
                error: "Rating submission failed. Try again.",
            });
        }

        // go back to recipe view page
        res.redirect("/view_recipe");
    } catch (err) {
        // display error for failure to submit recipe rating
        console.error(err);
        res.send("Error submitting recipe rating. Try again later.");
    }
});

// submit recipe handler
app.get("/save_recipe", async (req, res) => {
    // check fif user is signed in
    if (!req.session.userId) {
        return res.redirect("/signin");
    }

    try {
        // get saved recipes
        const result = await pool.query('SELECT recipes.* FROM recipes JOIN bookmarked_recipes ON recipes.recipe_id = bookmarked_recipes.recipe_id WHERE bookmarked_recipes.user_id = $1 ORDER BY recipes.recipe_id DESC', [req.session.userId]);

        // send over information to saved recipes page
        res.render("saved_recipes.ejs", {
            title: "Saved Recipes",
            error: null,
            recipes: result.rows
        });

    } catch (err) {
        // error for displaying saved recipes
        console.error(err);
        res.send("Error displaying saved recipes. Try again later.");
    }
});

// save recipe handler
app.post("/save_recipe", async (req, res) => {
    // check fif user is signed in
    if (!req.session.userId) {
        return res.redirect("/signin");
    }

    // store recipe id and score
    const { recipe_id } = req.body;
    
    // store user's id
    const user_id = req.session.userId;

    try {
        // insert information into ratings table
        const result = await pool.query('INSERT INTO bookmarked_recipes (user_id, recipe_id) VALUES ($1,$2)', [user_id, recipe_id]);

        // if database addition failed
        if (result.rowCount !== 1) {
            // return error
            return res.render('recipe_view', {
                title: "View Recipes",
                error: "Recipe saving failed. Try again.",
            });
        }

        // go back to recipe view page
        res.redirect("/view_recipe");
    } catch (err) {
        // display error for failure to submit recipe rating
        console.error(err);
        res.send("Error saving recipe. Try again later.");
    }
});

// unsave recipe handler
app.post("/unsave_recipe", async (req, res) => {
    // check fif user is signed in
    if (!req.session.userId) {
        return res.redirect("/signin");
    }

    // store recipe id and score
    const { recipe_id } = req.body;
    
    // store user's id
    const user_id = req.session.userId;

    try {
        // insert information into ratings table
        const result = await pool.query('DELETE FROM bookmarked_recipes WHERE user_id = $1 AND recipe_id = $2', [user_id, recipe_id]);

        // if database deletion failed
        if (result.rowCount !== 1) {
            // return error
            return res.render('recipe_view', {
                title: "View Recipes",
                error: "Saved recipe removal failed. Try again.",
            });
        }

        // go back to recipe view page
        res.redirect("/view_recipe");
    } catch (err) {
        // display error for failure to save recipe 
        console.error(err);
        res.send("Error saving recipe. Try again later.");
    }
});

// create collection handler
app.post("/create_collection", async (req, res) => {
    // check fif user is signed in
    if (!req.session.userId) {
        return res.redirect("/signin");
    }

    // store collection name
    const { name_of_collection, collection_description } = req.body;
    
    // store user's id
    const user_id = req.session.userId;

    try {
        // insert information into ratings table
        const result = await pool.query('INSERT INTO collections (user_id, name_of_collection, description_of_collection) VALUES ($1,$2,$3)', [user_id, name_of_collection, collection_description]);

        // if database addition failed
        if (result.rowCount !== 1) {
            // return error
            return res.render('recipe_view', {
                title: "Collections",
                error: "Collection creation failed. Try again.",
            });
        }

        // go back to collections page
        res.redirect("/collections");
    } catch (err) {
        // display error for failure to create recipe collection
        console.error(err);
        res.send("Error creating collection. Try again later.");
    }
});

// collections handler
app.get("/collections", async (req, res) => {
    // check fif user is signed in
    if (!req.session.userId) {
        return res.redirect("/signin");
    }

    try {
        // get collections
        const result = await pool.query('SELECT * FROM collections WHERE user_id = $1 ORDER BY collection_id DESC', [req.session.userId]);

        // send over information to collections page
        res.render("collections.ejs", {
            title: "Collections",
            error: null,
            collections: result.rows
        });

    } catch (err) {
        // error for displaying collections
        console.error(err);
        res.send("Error displaying collections. Try again later.");
    }
});

// add recipe to collection handler
app.post("/add_recipe_to_collection", async (req, res) => {
    // check fif user is signed in
    if (!req.session.userId) {
        return res.redirect("/signin");
    }

    // store collection and recipe id
    const { collection_id, recipe_id } = req.body;

    try {
        // insert information into collections table
        const result = await pool.query('INSERT INTO recipe_collections (collection_id, recipe_id) SELECT collection_id, $2 FROM collections WHERE collection_id = $1 AND user_id = $3', [collection_id, recipe_id, req.session.userId]);

        // if database addition failed
        if (result.rowCount !== 1) {
            // return error
            return res.render('collections.ejs', {
                title: "Collections",
                error: "Recipe save failed. Try again.",
            });
        }

        // go back to collections page
        res.redirect("/collections");
    } catch (err) {
        // display error for failure to store recipe
        console.error(err);
        res.send("Error creating collection. Try again later.");
    }
});

// remove recipe from collection handler
app.post("/remove_recipe_from_collection", async (req, res) => {
    // check fif user is signed in
    if (!req.session.userId) {
        return res.redirect("/signin");
    }

    // store collection and recipe id
    const { collection_id, recipe_id } = req.body;

    try {
        // delete recipe entry
        const result = await pool.query('DELETE FROM recipe_collections WHERE collection_id = $1 AND recipe_id = $2', [collection_id, recipe_id]);

        // if entry removal failed
        if (result.rowCount !== 1) {
            // return error
            return res.render('collections.ejs', {
                title: "Collections",
                error: "Recipe removal failed. Try again.",
            });
        }

        // go back to collections page
        res.redirect("/collections");
    } catch (err) {
        // display error for failure to remove recipe
        console.error(err);
        res.send("Error removing recipe from collection. Try again later.");
    }
});

/* IN PROGRESS (PHASE 2)
// collections handler
app.get("/collections/:id", async (req, res) => {
    // check fif user is signed in
    if (!req.session.userId) {
        return res.redirect("/signin");
    }
}); */

// handle page not found
app.use((req, res) => {
    res.status(404).send("<h1>Page not found</h1>");
});

// listen on assigned port
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}/`);
});