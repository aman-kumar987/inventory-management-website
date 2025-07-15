const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

// We need to provide a DOM environment for DOMPurify to work in a Node.js environment.
// JSDOM creates a "fake" browser window.
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

/**
 * Sanitizes a string to prevent XSS attacks.
 * @param {string | null | undefined} dirty The input string to sanitize.
 * @returns {string | null} The sanitized string, or null if the input was empty.
 */
const sanitize = (dirty) => {
    // Return null if the input is falsy (null, undefined, an empty string, etc.)
    // This prevents storing empty strings in the database for optional fields.
    if (!dirty) {
        return null;
    }
    // Use DOMPurify to strip out any potentially malicious HTML/JS.
    return DOMPurify.sanitize(dirty);
};

// Export the function so it can be used in other files (like itemController).
module.exports = {
    sanitize
};