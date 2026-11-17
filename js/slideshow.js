/* Slideshow — background + home slider */
let slideIndex = 0, homeSlideIndex = 0, homeSlideInterval = null;

function initBackgroundSlideshow() {
  const slides = document.querySelectorAll('.bg-slide');
  if (!slides.length) return;
  setInterval(() => {
    slides[slideIndex].classList.remove('active');
    slideIndex = (slideIndex + 1) % slides.length;
    slides[slideIndex].classList.add('active');
  }, 7000);
}

function initHomeSlider() {
  const slides = document.querySelectorAll('.home-slider-container .slide');
  if (!slides.length) return;
  document.getElementById('home-slide-prev')?.addEventListener('click', () => moveHomeSlide(-1));
  document.getElementById('home-slide-next')?.addEventListener('click', () => moveHomeSlide(1));
  startHomeSlideInterval();
}

function moveHomeSlide(n) {
  const slides = document.querySelectorAll('.home-slider-container .slide');
  if (!slides.length) return;
  homeSlideIndex = (homeSlideIndex + n + slides.length) % slides.length;
  slides.forEach(s => s.classList.remove('active'));
  slides[homeSlideIndex].classList.add('active');
  restartHomeSlideInterval();
}

function startHomeSlideInterval() {
  clearInterval(homeSlideInterval);
  homeSlideInterval = setInterval(() => moveHomeSlide(1), 5000);
}

function restartHomeSlideInterval() {
  clearInterval(homeSlideInterval);
  startHomeSlideInterval();
}
