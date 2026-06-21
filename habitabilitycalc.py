import numpy as np

def get_luminosity_from_mass(M_star):
    if M_star < 0.43:
        return 0.23 * M_star**2.3
    elif M_star < 2.0:
        return M_star**4
    elif M_star < 55:
        return 1.4 * M_star**3.5
    else:
        return 32000 * M_star

def random_num_planets(M_star):
    if M_star > 1.5:
        return np.random.randint(2, 8)
    elif M_star > 0.8:
        return np.random.randint(4, 12)
    else:
        return np.random.randint(3, 10)

def surface_gravity(mass_earth, radius_earth):
    """Surface gravity in Earth g units"""
    return round(mass_earth / (radius_earth ** 2), 2)

def estimate_planetary_system(M_star=1.0, L_star=None, spec_type=None, seed=None):
    if seed is not None:
        np.random.seed(seed)
    
    if L_star is None:
        L_star = get_luminosity_from_mass(M_star)
        print("(Using estimated luminosity from mass)")
    
    num_planets = random_num_planets(M_star)
    
    d_hz_inner = 0.95 * np.sqrt(L_star)
    d_hz_outer = 1.37 * np.sqrt(L_star)
    
    print(f"Star: {M_star:.2f} Msun | L: {L_star:.3f} Lsun", end="")
    if spec_type:
        print(f" | Type: {spec_type}")
    else:
        print()
    print(f"Generated planets: {num_planets} | HZ: {d_hz_inner:.3f} – {d_hz_outer:.3f} AU\n")
    
    a0 = 0.11 * (M_star ** 0.4) * np.random.uniform(0.75, 1.6)
    C = np.random.uniform(1.57, 1.84)
    
    system = []          # list of entries (planets or asteroid belts)
    habitable = None
    planet_counter = 1
    
    for n in range(num_planets + 3):   # extra buffer for asteroid replacement
        a = a0 * (C ** (planet_counter - 1))
        if a > 80:
            break
            
        period_yr = np.sqrt(a**3 / M_star)
        
        # Asteroid Belt chance (replaces a slot)
        if np.random.random() < 0.33 and len([x for x in system if x['type'] == 'Asteroid Belt']) == 0:
            system.append({
                'slot': planet_counter,
                'type': 'Asteroid Belt',
                'a': round(a, 3)
            })
            planet_counter += 1
            continue
        
        # === Planet ===
        if a < 2.0:                                      # Rocky
            roll = np.random.random()
            if M_star < 0.6:
                if roll < 0.45: mass_earth = np.random.uniform(0.05, 0.7)
                elif roll < 0.80: mass_earth = np.random.uniform(0.6, 2.2)
                else: mass_earth = np.random.uniform(2.0, 6.0)
            else:
                if roll < 0.35: mass_earth = np.random.uniform(0.05, 0.9)
                elif roll < 0.75: mass_earth = np.random.uniform(0.7, 3.0)
                else: mass_earth = np.random.uniform(3.0, 8.5)
            
            radius_earth = mass_earth ** (1.0/3.3) * np.random.uniform(0.85, 1.35)
            ptype = "Rocky"
            g = surface_gravity(mass_earth, radius_earth)
            extra = f" g={g}g"
            
        elif a < 8.0:
            mass_earth = np.random.uniform(6, 32)
            radius_earth = np.random.uniform(2.2, 4.4)
            ptype = "Ice Giant / Mini-Neptune"
            extra = ""
        else:
            mass_earth = np.random.uniform(20, 270)
            radius_earth = np.random.uniform(6.5, 13.0)
            ptype = "Gas Giant"
            extra = ""
        
        mass_earth = min(mass_earth, 400)
        in_hz = d_hz_inner <= a <= d_hz_outer
        
        # Moons
        num_moons = 0
        if mass_earth > 6:
            if np.random.random() < (0.70 if mass_earth > 25 else 0.40):
                num_moons = np.random.randint(1, 6)
        
        if in_hz and habitable is None:
            habitable = (planet_counter, a, radius_earth, mass_earth)
        
        system.append({
            'slot': planet_counter,
            'a': round(a, 3),
            'period_yr': round(period_yr, 2),
            'mass_E': round(mass_earth, 2),
            'radius_E': round(radius_earth, 2),
            'type': ptype,
            'hz': in_hz,
            'moons': num_moons,
            'g': extra
        })
        
        planet_counter += 1
        if len(system) >= num_planets:
            break
    
    # Display
    print("System Layout:")
    for item in system:
        if item['type'] == 'Asteroid Belt':
            print(f"{item['slot']:2d}: Asteroid Belt at a≈{item['a']:.3f} AU")
            continue
        
        hz_tag = " ← HABITABLE" if item.get('hz') else ""
        moon_text = f" | {item['moons']} moon(s)" if item.get('moons', 0) > 0 else ""
        
        print(f"{item['slot']:2d}: a={item['a']:6.3f} AU  P={item['period_yr']:5.2f} yr  "
              f"M={item['mass_E']:5.2f} M⊕  R={item['radius_E']:5.2f} R⊕  "
              f"{item['type']}{item.get('g', '')}{moon_text}{hz_tag}")
    
    if habitable:
        n, a, r, m = habitable
        print(f"\n🎯 Habitable candidate: Planet {n} at {a:.3f} AU")
    
    print(f"\nTotal planets: {len([x for x in system if x['type'] != 'Asteroid Belt'])}")
    print("-" * 60)

# ===================== RUN =====================
if __name__ == "__main__":
    
    """
    print("=== Example: Sun-like Star ===\n")
    estimate_planetary_system(M_star=1.0, L_star=1.0, spec_type="G2V", seed=42)
    
    print("\n=== Example: Red Dwarf ===\n")
    estimate_planetary_system(M_star=0.35, L_star=0.015, spec_type="M4V")
    """
    print("=== β Comae Berenices ===\n")
    estimate_planetary_system(M_star=1.413, L_star=3.572, spec_type="F9V")
    