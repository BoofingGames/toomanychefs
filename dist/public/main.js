document.addEventListener('DOMContentLoaded', () => {
    // --- Main Application State ---
    const state = {
        isSpinning: false,
        isMovieView: false,
        editingReviewId: null,
    };

    // --- DOM Element References ---
    const elements = {
        gridContainer: document.getElementById('grid-container'),
        spinButton: document.getElementById('spinButton'),
        winDisplay: document.getElementById('win-display'),
        provablyFairDisplay: document.getElementById('provably-fair-display'),
        toggleViewButton: document.getElementById('toggleViewButton'),
        slotMachine: document.getElementById('slot-machine'),
        movieCatalog: document.getElementById('movie-catalog'),
        movieList: document.getElementById('movie-list'),
        addReviewForm: document.getElementById('add-review-form'),
        movieSelect: document.getElementById('movie-select'),
    };

    const constants = { rows: 3, cols: 6 };

    // =================================================================================
    // --- View Toggling ---
    // =================================================================================

    function toggleView() {
        state.isMovieView = !state.isMovieView;
        elements.slotMachine.classList.toggle('hidden', state.isMovieView);
        elements.movieCatalog.classList.toggle('hidden', !state.isMovieView);
        elements.toggleViewButton.textContent = state.isMovieView ? 'Play Slot Machine' : 'View Movies';
        document.querySelector('h1').textContent = state.isMovieView ? 'Movie Catalog' : 'Provably Fair Slot Machine';

        if (state.isMovieView) {
            fetchAndRenderMovies();
        }
    }

    // =================================================================================
    // --- Movie & Review Logic ---
    // =================================================================================

    function renderReviews(reviews) {
        if (!reviews || reviews.length === 0) return '<p>No reviews yet.</p>';
        return reviews.map(review => `
            <div class="review-item" id="review-${review.id}">
                <div class="review-content">
                    <strong>${review.reviewer}</strong> (<span class="rating-value">${review.rating}</span>/5 stars):
                    <p class="comment-text">${review.comment}</p>
                </div>
                <div class="review-actions">
                    <button class="edit-review-btn" data-review-id="${review.id}">Edit</button>
                    <button class="delete-review-btn" data-review-id="${review.id}">Delete</button>
                </div>
            </div>
        `).join('');
    }

    function populateMovieSelect(movies) {
        elements.movieSelect.innerHTML = '';
        movies.forEach(movie => {
            const option = document.createElement('option');
            option.value = movie.id;
            option.textContent = movie.title;
            elements.movieSelect.appendChild(option);
        });
    }

    async function fetchAndRenderMovies() {
        try {
            elements.movieList.innerHTML = '<p>Loading movies...</p>';
            const response = await fetch('/api/movies');
            const movies = await response.json();

            elements.movieList.innerHTML = '';
            if (!movies || movies.length === 0) {
                elements.movieList.innerHTML = '<p>No movies found.</p>';
                return;
            }
            
            populateMovieSelect(movies);

            movies.forEach(movie => {
                const movieEl = document.createElement('div');
                movieEl.className = 'movie-item';
                movieEl.id = `movie-${movie.id}`;
                movieEl.innerHTML = `
                    <h3>${movie.title} (${movie.release_year})</h3>
                    <p><strong>Rating:</strong> ${movie.rating}/10</p>
                    <p>${movie.description}</p>
                    <div class="reviews-section">
                        <h4>Reviews</h4>
                        ${renderReviews(movie.reviews)}
                    </div>
                `;
                elements.movieList.appendChild(movieEl);
            });
        } catch (error) {
            console.error('Error fetching movies:', error);
            elements.movieList.innerHTML = '<p>Error loading movies. Please try again.</p>';
        }
    }

    async function handleAddReview(event) {
        event.preventDefault();
        const formData = new FormData(elements.addReviewForm);
        const reviewData = Object.fromEntries(formData.entries());
        try {
            const response = await fetch('/api/reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reviewData),
            });
            if (!response.ok) throw new Error('Failed to submit review');
            elements.addReviewForm.reset();
            await fetchAndRenderMovies();
        } catch (error) {
            console.error('Error submitting review:', error);
            alert('Could not submit your review. Please try again.');
        }
    }

    async function handleDeleteReview(reviewId) {
        if (!confirm('Are you sure you want to delete this review?')) return;
        try {
            const response = await fetch(`/api/reviews/${reviewId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete review');
            await fetchAndRenderMovies();
        } catch (error) {
            console.error('Error deleting review:', error);
            alert('Could not delete the review. Please try again.');
        }
    }

    function handleEditReview(reviewId) {
        if (state.editingReviewId) {
            // If we're already editing a review, cancel that one first
            handleCancelEdit(state.editingReviewId);
        }
        state.editingReviewId = reviewId;
        const reviewEl = document.getElementById(`review-${reviewId}`);
        reviewEl.classList.add('editing');

        const ratingSpan = reviewEl.querySelector('.rating-value');
        const commentP = reviewEl.querySelector('.comment-text');
        const currentRating = ratingSpan.textContent;
        const currentComment = commentP.textContent;

        ratingSpan.innerHTML = `<input type="number" class="edit-rating-input" value="${currentRating}" min="1" max="5">`;
        commentP.innerHTML = `<textarea class="edit-comment-textarea">${currentComment}</textarea>`;

        const actionsDiv = reviewEl.querySelector('.review-actions');
        actionsDiv.innerHTML = `
            <button class="save-review-btn" data-review-id="${reviewId}">Save</button>
            <button class="cancel-edit-btn" data-review-id="${reviewId}">Cancel</button>
        `;
    }

    async function handleSaveReview(reviewId) {
        const reviewEl = document.getElementById(`review-${reviewId}`);
        const newRating = reviewEl.querySelector('.edit-rating-input').value;
        const newComment = reviewEl.querySelector('.edit-comment-textarea').value;

        try {
            const response = await fetch(`/api/reviews/${reviewId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating: newRating, comment: newComment }),
            });
            if (!response.ok) throw new Error('Failed to save review');
            await fetchAndRenderMovies(); // Easiest way to refresh the view
        } catch (error) {
            console.error('Error saving review:', error);
            alert('Could not save your changes. Please try again.');
        } finally {
            state.editingReviewId = null;
        }
    }

    function handleCancelEdit(reviewId) {
        state.editingReviewId = null;
        fetchAndRenderMovies(); // Just refresh the whole list to revert changes
    }

    
    // =================================================================================
    // --- Slot Machine Logic (remains unchanged) ---
    // =================================================================================
    function createGrid(){for(let i=0;i<constants.rows*constants.cols;i++){const e=document.createElement("div");e.classList.add("cell"),elements.gridContainer.appendChild(e)}}function updateGrid(e){const t=elements.gridContainer.children;for(let n=0;n<constants.rows;n++)for(let o=0;o<constants.cols;o++){const s=n*constants.cols+o;t[s].classList.remove("win"),t[s].innerText=e[n][o]||''}}function highlightWins(e){e&&e.forEach(e=>{e.positions.forEach(e=>{const n=e.row*constants.cols+e.col;elements.gridContainer.children[n].classList.add("win")})})}async function handleSpin(){startSpinAnimation(),elements.winDisplay.textContent="Spinning...",elements.provablyFairDisplay.textContent="Server Seed: (spinning...)";try{const e=await fetch("/api/spin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientSeed:Math.random().toString(36).substring(2),nonce:Date.now()})}),t=await e.json();stopSpinAnimation(),updateGrid(t.grid),highlightWins(t.winningPaylines),elements.winDisplay.textContent=`Total Win: ${t.finalTotalWin.toFixed(2)}`,elements.provablyFairDisplay.textContent=`Server Seed: ${t.serverSeed}`,t.bonusResult&&setTimeout(()=>{elements.winDisplay.textContent="BONUS TRIGGERED! 10 Free Spins!",setTimeout(()=>playBonusSequence(t.bonusResult,t.serverSeed),2e3)},2e3)}catch(e){console.error("Spin Error:",e),stopSpinAnimation(),elements.winDisplay.textContent="Error!"}}function startSpinAnimation(){state.isSpinning=!0,elements.spinButton.disabled=!0;const e=setInterval(()=>{if(!state.isSpinning)return void clearInterval(e);for(let t=0;t<elements.gridContainer.children.length;t++)elements.gridContainer.children[t].innerText=Math.floor(9*Math.random())+1},50)}function stopSpinAnimation(){state.isSpinning=!1,elements.spinButton.disabled=!1}function playBonusSequence(e,t){elements.spinButton.disabled=!0;let n=0,o=0;!function s(){if(n>=e.bonusSpins.length)return elements.winDisplay.textContent=`Total Bonus Win: ${e.totalBonusWin.toFixed(2)}`,elements.spinButton.disabled=!1,void(elements.provablyFairDisplay.textContent=`Server Seed: ${t}`);const i=e.bonusSpins[n];o+=i.finalTotalWin,updateGrid(i.grid),highlightWins(i.winningPaylines),elements.winDisplay.textContent=`Bonus Spin ${n+1}/${e.bonusSpins.length} | Win: ${o.toFixed(2)}`,n++,setTimeout(s,1e3)}()}

    // --- Initial Setup & Event Delegation ---
    createGrid();
    elements.spinButton.addEventListener('click', handleSpin);
    elements.toggleViewButton.addEventListener('click', toggleView);
    elements.addReviewForm.addEventListener('submit', handleAddReview);
    elements.movieList.addEventListener('click', (event) => {
        const target = event.target;
        const reviewId = target.dataset.reviewId;
        if (target.classList.contains('delete-review-btn')) {
            handleDeleteReview(reviewId);
        } else if (target.classList.contains('edit-review-btn')) {
            handleEditReview(reviewId);
        } else if (target.classList.contains('save-review-btn')) {
            handleSaveReview(reviewId);
        } else if (target.classList.contains('cancel-edit-btn')) {
            handleCancelEdit(reviewId);
        }
    });
});