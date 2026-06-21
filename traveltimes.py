import numpy as np
import pandas as pd
from math import sinh, cosh, acosh, asinh, sqrt
import sys
import os

# Constants
C = 1.0
G_LY_PER_YR2 = 1.03

def ra_dec_to_cartesian(ra_hours, dec_deg, dist_ly):
    ra_rad = np.deg2rad(ra_hours * 15)
    dec_rad = np.deg2rad(dec_deg)
    x = dist_ly * np.cos(dec_rad) * np.cos(ra_rad)
    y = dist_ly * np.cos(dec_rad) * np.sin(ra_rad)
    z = dist_ly * np.sin(dec_rad)
    return np.array([x, y, z])

def distance_between(row1, row2):
    pos1 = ra_dec_to_cartesian(row1['ra_hours'], row1['dec_deg'], row1['dist_ly'])
    pos2 = ra_dec_to_cartesian(row2['ra_hours'], row2['dec_deg'], row2['dist_ly'])
    return np.linalg.norm(pos1 - pos2)

def brachistochrone_time(d_ly, a_g=0.5, max_v_c=0.63):
    """Core function: returns (external_time_y, ship_time_y, max_v_reached)"""
    a = a_g * G_LY_PER_YR2
    
    if d_ly < 1e-6:
        return 0.0, 0.0, 0.0
    
    rapidity_max = asinh(max_v_c / np.sqrt(1 - max_v_c**2))
    gamma_max = 1 / np.sqrt(1 - max_v_c**2)
    d_accel_one = (C**2 / a) * (cosh(rapidity_max) - 1)
    d_accel_decel = 2 * d_accel_one
    
    if d_ly <= d_accel_decel:
        half_d = d_ly / 2.0
        rapidity_half = acosh(1 + (a * half_d) / C**2)
        tau_half = (C / a) * rapidity_half
        t_half = (C / a) * sinh(rapidity_half)
        return 2 * t_half, 2 * tau_half, np.tanh(rapidity_half)
    else:
        coast_d = d_ly - d_accel_decel
        t_accel_one = (C / a) * sinh(rapidity_max)
        t_coast = coast_d / max_v_c
        t_total = 2 * t_accel_one + t_coast
        tau_accel_one = (C / a) * rapidity_max
        tau_coast = t_coast / gamma_max
        return t_total, 2 * tau_accel_one + tau_coast, max_v_c


# ==================== CONVENIENCE FUNCTIONS ====================

def calculate_route(df, from_name, to_name, accel_g=0.5, max_v_c=0.63):
    """Main function you can call easily."""
    star_from = df[df['name'].str.strip().str.lower() == from_name.strip().lower()]
    star_to = df[df['name'].str.strip().str.lower() == to_name.strip().lower()]
    
    if len(star_from) == 0 or len(star_to) == 0:
        print(f"Error: Could not find '{from_name}' or '{to_name}'")
        return None
    
    star_from = star_from.iloc[0]
    star_to = star_to.iloc[0]
    
    dist = distance_between(star_from, star_to)
    t_ext, t_ship, v_max = brachistochrone_time(dist, accel_g, max_v_c)
    
    print(f"\n=== Route: {from_name} → {to_name} ===")
    print(f"Distance          : {dist:.3f} ly")
    print(f"Acceleration      : {accel_g}g")
    print(f"Max velocity      : {max_v_c}c")
    print(f"External time     : {t_ext:.2f} years")
    print(f"Shipboard time    : {t_ship:.2f} years")
    print(f"Max speed reached : {v_max:.3f}c")
    
    return {
        'from': from_name,
        'to': to_name,
        'dist_ly': dist,
        't_external_y': t_ext,
        't_ship_y': t_ship,
        'max_v_c': v_max
    }


# ==================== MAIN ====================
if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(script_dir, "systems.csv")
    
    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} not found.")
        sys.exit(1)
    
    df = pd.read_csv(csv_path)
    print(f"Loaded {len(df)} star systems.\n")
    
    # Example usage of the new function
    calculate_route(df, "Sol", "Wolf 359", accel_g=0.5, max_v_c=0.63)
    calculate_route(df, "Wolf 359", "Ross 128", accel_g=0.5, max_v_c=0.63)
    calculate_route(df, "20 Leonis Minoris","Gamma Pavonis",  accel_g=0.5, max_v_c=0.63)
    # You can call it anywhere with different parameters