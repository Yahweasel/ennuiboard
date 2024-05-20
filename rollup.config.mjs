import terser from "@rollup/plugin-terser";

export default {
    input: "src/ennuiboard.js",
    output: [
        {
            file: "dist/ennuiboard.umd.js",
            format: "umd",
            name: "Ennuiboard"
        },
        {
            file: "dist/ennuiboard.mjs",
            format: "es"
        },
        {
            file: "dist/ennuiboard.js",
            format: "iife",
            name: "Ennuiboard"
        },
        {
            file: "dist/ennuiboard.min.js",
            format: "iife",
            name: "Ennuiboard",
            plugins: [terser({
                format: {
                    comments: "/^!/"
                }
            })]
        }
    ],
    context: "this"
};
