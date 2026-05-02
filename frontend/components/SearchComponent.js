import Fuse from 'fuse.js';

let fuseInstance = null;
let currentSearchCallback = null;

export function initSearch(inputElement, onResultsCallback) {
    currentSearchCallback = onResultsCallback;
    inputElement.addEventListener('input', (e) => {
        const query = e.target.value;
        if (fuseInstance && query.length > 0) {
            const results = fuseInstance.search(query);
            const suggestions = results.slice(0, 5).map(r => r.item.name);
            showAutocomplete(suggestions);
            onResultsCallback(results.map(r => r.item));
            checkDidYouMean(query, results);
        } else if (query.length === 0 && fuseInstance) {
            hideAutocomplete();
            onResultsCallback(fuseInstance._docs);
        }
    });
}

export function performSmartSearch(hospitals, query, callback) {
    const options = {
        keys: ['name', 'services', 'address'],
        threshold: 0.4,
        includeScore: true,
        minMatchCharLength: 2
    };
    fuseInstance = new Fuse(hospitals, options);
    if (query && query.length > 0) {
        const results = fuseInstance.search(query);
        callback(results.map(r => r.item));
    } else {
        callback(hospitals);
    }
}

function showAutocomplete(suggestions) {
    const box = document.getElementById('autocompleteSuggestions');
    if (!box) return;
    if (suggestions.length) {
        box.innerHTML = suggestions.map(s => `<div class="autocomplete-item">${s}</div>`).join('');
        box.style.display = 'block';
        document.querySelectorAll('.autocomplete-item').forEach(el => {
            el.addEventListener('click', () => {
                document.getElementById('smartSearch').value = el.innerText;
                box.style.display = 'none';
                if (fuseInstance) {
                    const res = fuseInstance.search(el.innerText);
                    currentSearchCallback?.(res.map(r => r.item));
                }
            });
        });
    } else {
        box.style.display = 'none';
    }
}

function checkDidYouMean(query, results) {
    const didYouMeanDiv = document.getElementById('didYouMean');
    if (results.length === 0 && query.length > 2) {
        const suggestion = getFuzzySuggestion(query);
        if (suggestion) {
            didYouMeanDiv.innerHTML = `Did you mean: <strong>${suggestion}</strong>? <a href="#" id="applySuggestion">Search</a>`;
            document.getElementById('applySuggestion')?.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('smartSearch').value = suggestion;
                const newResults = fuseInstance.search(suggestion);
                currentSearchCallback?.(newResults.map(r => r.item));
                didYouMeanDiv.innerHTML = '';
            });
        }
    } else {
        didYouMeanDiv.innerHTML = '';
    }
}

function getFuzzySuggestion(word) {
    const common = ['Maternity', 'X-ray', 'ICU', 'Pharmacy', 'Dental', 'Emergency'];
    for (let term of common) {
        if (term.toLowerCase().includes(word.toLowerCase()) || word.toLowerCase().includes(term.toLowerCase()))
            return term;
    }
    return null;
}

function hideAutocomplete() {
    const box = document.getElementById('autocompleteSuggestions');
    if (box) box.style.display = 'none';
}